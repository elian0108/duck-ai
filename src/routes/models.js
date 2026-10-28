const express = require('express');

function createModelsRouter(engine) {
  const router = express.Router();

  // GET /v1/models
  router.get('/', (req, res) => {
    res.json(engine.getModels());
  });

  // GET /v1/models/:modelId
  router.get('/:modelId', (req, res) => {
    const list = engine.getModels().data;
    const model = list.find(m => m.id === req.params.modelId || m.aliases?.includes(req.params.modelId));
    if (!model) {
      return res.status(404).json({
        error: {
          message: `Model '${req.params.modelId}' not found.`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      });
    }
    res.json(model);
  });

  return router;
}

module.exports = createModelsRouter;
