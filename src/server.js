const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const DuckAIEngine = require('./engine/duckai-engine');
const createChatRouter = require('./routes/chat');
const createMessagesRouter = require('./routes/messages');
const createModelsRouter = require('./routes/models');
const createHealthRouter = require('./routes/health');

async function startServer() {
  const app = express();

  // Engine instance
  const engine = new DuckAIEngine(config);

  // Global middlewares
  app.use(cors());
  app.use((req, res, next) => {
    if (!req.path.startsWith('/health') && req.path !== '/') {
      console.log(`[HTTP] ${req.method} ${req.url}`);
    }
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Optional API Key check middleware (supports both Bearer and x-api-key)
  if (config.apiKey) {
    const authMiddleware = (req, res, next) => {
      const authHeader = req.headers.authorization;
      const xApiKey = req.headers['x-api-key'];
      const key = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null) || xApiKey;
      if (key !== config.apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            message: 'Invalid API key provided.',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }
      next();
    };

    app.use('/v1', authMiddleware);
    app.use('/messages', authMiddleware);
  }

  // Claude Code connection probe & ping compatibility
  app.all(['/api/hello', '/v1/api/hello', '/v1/v1/api/hello'], (req, res) => {
    res.status(200).json({ status: 'ok', service: 'duckai-gateway' });
  });

  const chatRouter = createChatRouter(engine);
  const messagesRouter = createMessagesRouter(engine);
  const modelsRouter = createModelsRouter(engine);

  // Mount API routes (OpenAI, DeepSeek Harness & Anthropic compatible)
  // Supports /v1/chat, /chat and /v1/v1/chat (for flexible Base URLs)
  app.use('/v1/chat', chatRouter);
  app.use('/chat', chatRouter);
  app.use('/v1/v1/chat', chatRouter);

  app.use('/v1/messages', messagesRouter);
  app.use('/v1/v1/messages', messagesRouter);
  app.use('/messages', messagesRouter);

  app.use('/v1/models', modelsRouter);
  app.use('/models', modelsRouter);
  app.use('/v1/v1/models', modelsRouter);
  app.use('/', createHealthRouter(engine));

  // Serve static premium dashboard
  app.use(express.static(path.join(__dirname, '../public')));

  // Fallback for SPA/UI
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/v1') || 
      req.path.startsWith('/chat') || 
      req.path.startsWith('/models') || 
      req.path.startsWith('/messages') || 
      req.path.startsWith('/api') || 
      req.path.startsWith('/health')
    ) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Initialize pool before listening to prevent race conditions
  console.log('[DuckAI] Pre-warming browser worker pool...');
  try {
    await engine.init();
    console.log('[DuckAI] Browser worker pool pre-warmed and ready!');
  } catch (err) {
    console.warn('[DuckAI] Pre-warm warning (will initialize on demand):', err.message);
  }

  // Start HTTP Server
  const server = app.listen(config.port, config.host, () => {
    console.log(`\n🦆 =================================================`);
    console.log(`🦆   DuckAI Multi-Protocol API Gateway`);
    console.log(`🦆 =================================================`);
    console.log(`🚀   Server running on:        http://localhost:${config.port}`);
    console.log(`📊   Usage & Quota Dashboard:  http://localhost:${config.port}`);
    console.log(`⚡   DeepSeek Harness BaseURL: http://localhost:${config.port}/v1`);
    console.log(`📡   OpenAI Chat API:          http://localhost:${config.port}/v1/chat/completions`);
    console.log(`🤖   Anthropic Messages API:   http://localhost:${config.port}/v1/messages`);
    console.log(`📋   Models Endpoint:          http://localhost:${config.port}/v1/models`);
    console.log(`❤️   Health & Usage Stats:     http://localhost:${config.port}/api/usage`);
    console.log(`🦆 =================================================\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[DuckAI] Stopping server and shutting down workers...');
    server.close();
    await engine.close();
    process.exit(0);
  };

  // Process resilience handlers
  process.on('unhandledRejection', (reason) => {
    console.warn('[DuckAI Warning] Unhandled Rejection:', reason?.message || reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[DuckAI Error] Uncaught Exception:', err.message);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(err => {
  console.error('[DuckAI] Fatal startup error:', err);
  process.exit(1);
});
