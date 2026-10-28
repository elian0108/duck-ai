const puppeteer = require('puppeteer-core');
const DuckWorker = require('./duck-worker');

class WorkerPool {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.workers = [];
    this.queue = [];
    this.isInitializing = false;
    this.isReady = false;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatencyMs: 0,
      startTime: Date.now()
    };
  }

  async init() {
    if (this.isReady) return;
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        console.log(`[WorkerPool] Launching browser engine (path: ${this.config.chromePath})...`);
        if (!this.browser) {
          this.browser = await puppeteer.launch({
            executablePath: this.config.chromePath,
            headless: this.config.headless,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--window-size=1280,800'
            ]
          });
        }

        console.log(`[WorkerPool] Creating ${this.config.poolSize} pre-warmed worker(s)...`);
        for (let i = 0; i < this.config.poolSize; i++) {
          const worker = new DuckWorker(i + 1, this.browser, this.config);
          await worker.init();
          this.workers.push(worker);
        }

        this.isReady = true;
        console.log(`[WorkerPool] All ${this.workers.length} worker(s) are ready to handle requests!`);

        // Drain queue if requests arrived while initializing
        while (this.queue.length > 0) {
          const idle = this.workers.find(w => w.isReady && !w.isBusy);
          if (!idle) break;
          const next = this.queue.shift();
          next(idle);
        }
      } catch (err) {
        console.error('[WorkerPool] Initialization failed:', err.message);
        this.isReady = false;
        throw err;
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Acquire an idle worker, or wait in FIFO queue with timeout & abort support
   */
  async acquireWorker(options = {}) {
    const { signal, timeoutMs = 35000 } = options;
    const startTime = Date.now();

    if (signal?.aborted) {
      throw new Error('Request already aborted');
    }

    // Wait for in-flight initialization if running
    if (this.isInitializing && this.initPromise) {
      try {
        await Promise.race([
          this.initPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Pool initialization timed out')), timeoutMs))
        ]);
      } catch (e) {
        console.warn('[WorkerPool] Wait for init warning:', e.message);
      }
    }

    if (!this.isReady || this.workers.length === 0) {
      await this.init();
    }

    const idleWorker = this.workers.find(w => w.isReady && !w.isBusy);
    if (idleWorker) {
      idleWorker.isBusy = true;
      return idleWorker;
    }

    // Wait in queue with strict timeout and abort listener
    return new Promise((resolve, reject) => {
      const remainingTime = Math.max(5000, timeoutMs - (Date.now() - startTime));
      let timer = null;
      let onAbort = null;

      const handler = (worker) => {
        if (timer) clearTimeout(timer);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        worker.isBusy = true;
        resolve(worker);
      };

      timer = setTimeout(() => {
        const idx = this.queue.indexOf(handler);
        if (idx !== -1) this.queue.splice(idx, 1);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        reject(new Error(`Timeout waiting for available worker in pool (${remainingTime}ms)`));
      }, remainingTime);

      if (signal) {
        onAbort = () => {
          if (timer) clearTimeout(timer);
          const idx = this.queue.indexOf(handler);
          if (idx !== -1) this.queue.splice(idx, 1);
          signal.removeEventListener('abort', onAbort);
          reject(new Error('Request aborted while waiting for worker'));
        };
        signal.addEventListener('abort', onAbort);
      }

      this.queue.push(handler);
    });
  }

  /**
   * Release worker back to pool or assign to next queued request
   */
  releaseWorker(worker) {
    worker.isBusy = false;
    if (this.queue.length > 0) {
      const nextRequest = this.queue.shift();
      nextRequest(worker);
    }
  }

  /**
   * Execute chat completion via the pool
   */
  async executeChat(options) {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const worker = await this.acquireWorker(options);
    try {
      const result = await worker.chat(options);
      
      const duration = Date.now() - startTime;
      this.stats.successfulRequests++;
      this.stats.totalLatencyMs += duration;

      return {
        ...result,
        durationMs: duration,
        workerId: worker.id
      };
    } catch (err) {
      this.stats.failedRequests++;
      console.error(`[WorkerPool] Worker ${worker.id} failed:`, err.message);

      // Try recycling worker if error occurred
      try {
        await worker.resetChat();
      } catch (e) {}

      throw err;
    } finally {
      this.releaseWorker(worker);
    }
  }

  getStats() {
    const avgLatency = this.stats.successfulRequests > 0
      ? Math.round(this.stats.totalLatencyMs / this.stats.successfulRequests)
      : 0;

    return {
      status: this.isReady ? 'online' : this.isInitializing ? 'initializing' : 'offline',
      poolSize: this.workers.length,
      busyWorkers: this.workers.filter(w => w.isBusy).length,
      idleWorkers: this.workers.filter(w => !w.isBusy).length,
      queueLength: this.queue.length,
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      avgLatencyMs: avgLatency,
      uptimeSeconds: Math.floor((Date.now() - this.stats.startTime) / 1000)
    };
  }

  async close() {
    console.log('[WorkerPool] Shutting down workers...');
    for (const w of this.workers) {
      await w.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = WorkerPool;
