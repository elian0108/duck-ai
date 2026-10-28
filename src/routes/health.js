const express = require('express');

function createHealthRouter(engine) {
  const router = express.Router();

  const getHealthPayload = () => {
    const stats = engine.getStats();
    return {
      status: stats.capacity?.isRateLimited ? 'degraded' : 'ok',
      service: 'duckai-api-server',
      version: '1.0.0',
      uptime: stats.uptimeSeconds,
      pool: {
        size: stats.capacity?.poolSize || 2,
        idle: stats.capacity?.idleWorkers || 2,
        busy: stats.capacity?.busyWorkers || 0,
        queue: stats.capacity?.queueLength || 0
      },
      capacity: stats.capacity,
      deepseek_harness_ready: true
    };
  };

  router.get('/health', (req, res) => {
    res.json(getHealthPayload());
  });

  router.get('/v1/health', (req, res) => {
    res.json(getHealthPayload());
  });

  router.get('/api/stats', (req, res) => {
    res.json(engine.getStats());
  });

  router.get('/api/usage', (req, res) => {
    res.json(engine.getUsageSummary());
  });

  return router;
}

module.exports = createHealthRouter;
