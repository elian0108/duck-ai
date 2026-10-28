const fs = require('fs');
const path = require('path');

class UsageTracker {
  constructor(options = {}) {
    this.dailyQuota = parseInt(process.env.DAILY_QUOTA || options.dailyQuota || '150', 10);
    this.storagePath = path.join(__dirname, '../data/usage-stats.json');
    this.startTime = Date.now();

    this.currentDate = this.getTodayDateString();
    this.totalRequests = 0;
    this.requestsToday = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalLatencyMs = 0;

    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalTokens = 0;
    this.tokensToday = 0;

    this.modelUsage = {};
    this.recentLogs = []; // ring buffer of last 50 requests
    this.maxLogs = 50;

    this.rateLimit = {
      isLimited: false,
      limitedUntil: null,
      reason: null
    };

    this.loadPersistedStats();
    this.checkDayRollover();
  }

  getTodayDateString() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }

  getSecondsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }

  checkDayRollover() {
    const today = this.getTodayDateString();
    if (this.currentDate !== today) {
      console.log(`[UsageTracker] Day rollover detected (${this.currentDate} -> ${today}). Resetting daily quota counter.`);
      this.currentDate = today;
      this.requestsToday = 0;
      this.tokensToday = 0;
      this.savePersistedStats();
    }
  }

  recordRequest({
    endpoint = '/v1/chat/completions',
    model = 'deepseek-chat',
    backendModel = 'mistral-small-2603',
    status = 200,
    durationMs = 0,
    promptTokens = 0,
    completionTokens = 0,
    error = null
  }) {
    this.checkDayRollover();

    const isSuccess = status >= 200 && status < 400;
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);

    this.totalRequests++;
    this.requestsToday++;

    if (isSuccess) {
      this.successfulRequests++;
      this.totalLatencyMs += durationMs;
    } else {
      this.failedRequests++;
    }

    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
    this.totalTokens += totalTokens;
    this.tokensToday += totalTokens;

    // Per model usage
    const mKey = model || 'default';
    if (!this.modelUsage[mKey]) {
      this.modelUsage[mKey] = {
        requests: 0,
        tokens: 0,
        totalDurationMs: 0
      };
    }
    this.modelUsage[mKey].requests++;
    this.modelUsage[mKey].tokens += totalTokens;
    this.modelUsage[mKey].totalDurationMs += durationMs;

    // Append to recent logs (ring buffer)
    const logItem = {
      id: 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      endpoint,
      model,
      backendModel,
      status,
      durationMs: Math.round(durationMs),
      promptTokens,
      completionTokens,
      totalTokens,
      error: error ? String(error).slice(0, 150) : null
    };

    this.recentLogs.unshift(logItem);
    if (this.recentLogs.length > this.maxLogs) {
      this.recentLogs.pop();
    }

    this.savePersistedStats();
  }

  reportRateLimit(cooldownSeconds = 60, reason = 'Duck.ai rate limit or capacity reached') {
    const until = Date.now() + cooldownSeconds * 1000;
    this.rateLimit = {
      isLimited: true,
      limitedUntil: until,
      reason
    };
    console.warn(`[UsageTracker] Rate limit flagged until ${new Date(until).toLocaleTimeString()}: ${reason}`);
  }

  clearRateLimit() {
    this.rateLimit = {
      isLimited: false,
      limitedUntil: null,
      reason: null
    };
  }

  isCurrentlyRateLimited() {
    if (!this.rateLimit.isLimited) return false;
    if (this.rateLimit.limitedUntil && Date.now() > this.rateLimit.limitedUntil) {
      this.clearRateLimit();
      return false;
    }
    return true;
  }

  getStats(poolStats = {}) {
    this.checkDayRollover();

    const remainingToday = Math.max(0, this.dailyQuota - this.requestsToday);
    const percentUsed = Math.min(100, Math.round((this.requestsToday / this.dailyQuota) * 100));
    const percentRemaining = Math.max(0, 100 - percentUsed);
    const avgLatencyMs = this.successfulRequests > 0
      ? Math.round(this.totalLatencyMs / this.successfulRequests)
      : 0;
    const successRate = this.totalRequests > 0
      ? Math.round((this.successfulRequests / this.totalRequests) * 1000) / 10
      : 100;

    const rateLimited = this.isCurrentlyRateLimited();
    const secondsToReset = this.getSecondsUntilMidnight();

    return {
      date: this.currentDate,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      capacity: {
        dailyQuota: this.dailyQuota,
        requestsToday: this.requestsToday,
        remainingToday,
        percentUsed,
        percentRemaining,
        secondsToReset,
        isRateLimited: rateLimited,
        limitedUntil: rateLimited ? this.rateLimit.limitedUntil : null,
        rateLimitReason: rateLimited ? this.rateLimit.reason : null,
        // Worker concurrency capacity from pool
        poolSize: poolStats.poolSize || 2,
        idleWorkers: poolStats.idleWorkers || 2,
        busyWorkers: poolStats.busyWorkers || 0,
        queueLength: poolStats.queueLength || 0,
        workerCapacityPercent: poolStats.poolSize > 0 
          ? Math.round(((poolStats.idleWorkers || 0) / poolStats.poolSize) * 100) 
          : 100
      },
      usage: {
        totalRequests: this.totalRequests,
        requestsToday: this.requestsToday,
        successfulRequests: this.successfulRequests,
        failedRequests: this.failedRequests,
        successRate,
        avgLatencyMs,
        tokens: {
          promptTokens: this.totalPromptTokens,
          completionTokens: this.totalCompletionTokens,
          totalTokens: this.totalTokens,
          tokensToday: this.tokensToday
        },
        modelUsage: this.modelUsage
      },
      recentLogs: this.recentLogs.slice(0, 25)
    };
  }

  savePersistedStats() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        currentDate: this.currentDate,
        totalRequests: this.totalRequests,
        requestsToday: this.requestsToday,
        successfulRequests: this.successfulRequests,
        failedRequests: this.failedRequests,
        totalLatencyMs: this.totalLatencyMs,
        totalPromptTokens: this.totalPromptTokens,
        totalCompletionTokens: this.totalCompletionTokens,
        totalTokens: this.totalTokens,
        tokensToday: this.tokensToday,
        modelUsage: this.modelUsage
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // non-fatal
    }
  }

  loadPersistedStats() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.currentDate === this.currentDate) {
          this.requestsToday = parsed.requestsToday || 0;
          this.tokensToday = parsed.tokensToday || 0;
        }
        this.totalRequests = parsed.totalRequests || 0;
        this.successfulRequests = parsed.successfulRequests || 0;
        this.failedRequests = parsed.failedRequests || 0;
        this.totalLatencyMs = parsed.totalLatencyMs || 0;
        this.totalPromptTokens = parsed.totalPromptTokens || 0;
        this.totalCompletionTokens = parsed.totalCompletionTokens || 0;
        this.totalTokens = parsed.totalTokens || 0;
        this.modelUsage = parsed.modelUsage || {};
      }
    } catch (e) {
      // ignore
    }
  }
}

module.exports = UsageTracker;
