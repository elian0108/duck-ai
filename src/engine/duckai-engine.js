const WorkerPool = require('./worker-pool');
const { MODELS, resolveModel } = require('../models');
const UsageTracker = require('../usage-tracker');

class DuckAIEngine {
  constructor(config) {
    this.config = config;
    this.pool = new WorkerPool(config);
    this.usageTracker = new UsageTracker(config);
  }

  async init() {
    await this.pool.init();
  }

  generateId() {
    return 'chatcmpl-' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  }

  estimateTokens(text) {
    if (!text) return 0;
    // ~4 chars per token approximation
    return Math.max(1, Math.ceil(text.length / 4));
  }

  getModels() {
    const now = Math.floor(Date.now() / 1000);
    return {
      object: 'list',
      data: MODELS.map(m => ({
        id: m.id,
        object: 'model',
        created: m.created || now,
        owned_by: 'duckai',
        permission: [],
        root: m.id,
        parent: null,
        name: m.name,
        provider: m.provider,
        description: m.description,
        context_window: m.contextWindow,
        badge: m.badge,
        aliases: m.aliases
      }))
    };
  }

  getStats() {
    const poolStats = this.pool.getStats();
    return this.usageTracker.getStats(poolStats);
  }

  getUsageSummary() {
    const poolStats = this.pool.getStats();
    return this.usageTracker.getStats(poolStats);
  }

  /**
   * Execute chat completion (supports streaming and non-streaming)
   */
  async createChatCompletion(request, options = {}) {
    const { model, messages, stream } = request;
    const targetModel = resolveModel(model);
    const backendModelId = targetModel.backendModelId || targetModel.id;
    const requestedModelId = model || targetModel.id;
    const id = this.generateId();
    const created = Math.floor(Date.now() / 1000);
    const startTime = Date.now();

    // Calculate prompt tokens
    const promptString = Array.isArray(messages)
      ? messages.map(m => m.content || '').join(' ')
      : String(messages || '');
    const promptTokens = this.estimateTokens(promptString);

    if (stream) {
      const { onChunk, onDone, onError } = options;

      // Send initial role chunk
      const initialChunk = {
        id,
        object: 'chat.completion.chunk',
        created,
        model: requestedModelId,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: null
          }
        ]
      };
      if (onChunk) onChunk(initialChunk);

      let fullContent = '';

      try {
        const result = await this.pool.executeChat({
          model: backendModelId,
          messages,
          signal: options.signal,
          onToken: (token) => {
            fullContent += token;
            const chunk = {
              id,
              object: 'chat.completion.chunk',
              created,
              model: requestedModelId,
              choices: [
                {
                  index: 0,
                  delta: { content: token },
                  finish_reason: null
                }
              ]
            };
            if (onChunk) onChunk(chunk);
          }
        });

        const durationMs = Date.now() - startTime;
        const completionTokens = this.estimateTokens(fullContent);

        // Record metrics
        this.usageTracker.recordRequest({
          endpoint: '/v1/chat/completions',
          model: requestedModelId,
          backendModel: backendModelId,
          status: 200,
          durationMs,
          promptTokens,
          completionTokens,
          error: null
        });

        // Send final chunk
        const finalChunk = {
          id,
          object: 'chat.completion.chunk',
          created,
          model: requestedModelId,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }
          ]
        };
        if (onChunk) onChunk(finalChunk);
        if (onDone) onDone({ id, model: requestedModelId, fullContent });

      } catch (err) {
        const durationMs = Date.now() - startTime;
        
        // Check if Duck.ai rate-limit error
        if (err.message && (err.message.includes('disabled') || err.message.includes('limit') || err.message.includes('busy'))) {
          this.usageTracker.reportRateLimit(120, err.message);
        }

        this.usageTracker.recordRequest({
          endpoint: '/v1/chat/completions',
          model: requestedModelId,
          backendModel: backendModelId,
          status: 500,
          durationMs,
          promptTokens,
          completionTokens: 0,
          error: err.message
        });

        if (onError) onError(err);
        else throw err;
      }

    } else {
      // Non-streaming completion
      try {
        const result = await this.pool.executeChat({
          model: backendModelId,
          messages,
          signal: options.signal
        });

        const durationMs = Date.now() - startTime;
        const completionTokens = this.estimateTokens(result.text);

        // Record metrics
        this.usageTracker.recordRequest({
          endpoint: '/v1/chat/completions',
          model: requestedModelId,
          backendModel: backendModelId,
          status: 200,
          durationMs,
          promptTokens,
          completionTokens,
          error: null
        });

        return {
          id,
          object: 'chat.completion',
          created,
          model: requestedModelId,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: result.text
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          },
          _duckai: {
            model_name: targetModel.name,
            backend_model: backendModelId,
            provider: targetModel.provider,
            latency_ms: result.durationMs,
            worker_id: result.workerId
          }
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;

        if (err.message && (err.message.includes('disabled') || err.message.includes('limit') || err.message.includes('busy'))) {
          this.usageTracker.reportRateLimit(120, err.message);
        }

        this.usageTracker.recordRequest({
          endpoint: '/v1/chat/completions',
          model: requestedModelId,
          backendModel: backendModelId,
          status: 500,
          durationMs,
          promptTokens,
          completionTokens: 0,
          error: err.message
        });

        throw err;
      }
    }
  }

  async close() {
    await this.pool.close();
  }
}

module.exports = DuckAIEngine;
