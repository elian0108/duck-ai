const express = require('express');

function createChatRouter(engine) {
  const router = express.Router();

  router.post('/completions', async (req, res) => {
    const { model, messages, stream } = req.body || {};

    if (!messages || (!Array.isArray(messages) && typeof messages !== 'string')) {
      return res.status(400).json({
        error: {
          message: "'messages' is a required field and must be an array or string.",
          type: 'invalid_request_error',
          param: 'messages',
          code: null
        }
      });
    }

    if (Array.isArray(messages) && messages.length === 0) {
      return res.status(400).json({
        error: {
          message: "'messages' array cannot be empty.",
          type: 'invalid_request_error',
          param: 'messages',
          code: null
        }
      });
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    if (stream) {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx/proxies
      res.flushHeaders?.();

      try {
        await engine.createChatCompletion(
          { model, messages, stream: true },
          {
            signal: abortController.signal,
            onChunk: (chunk) => {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            },
            onDone: () => {
              res.write('data: [DONE]\n\n');
              res.end();
            },
            onError: (err) => {
              console.error('[ChatRouter] Stream error:', err.message);
              const errPayload = {
                error: {
                  message: err.message || 'Internal server error during streaming',
                  type: 'server_error',
                  code: null
                }
              };
              res.write(`data: ${JSON.stringify(errPayload)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            }
          }
        );
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({
            error: {
              message: err.message,
              type: 'api_error',
              code: null
            }
          });
        } else {
          res.end();
        }
      }

    } else {
      // Non-streaming completion
      try {
        const response = await engine.createChatCompletion(
          { model, messages, stream: false },
          { signal: abortController.signal }
        );
        res.json(response);
      } catch (err) {
        console.error('[ChatRouter] Completion error:', err.message);
        res.status(500).json({
          error: {
            message: err.message,
            type: 'api_error',
            code: null
          }
        });
      }
    }
  });

  return router;
}

module.exports = createChatRouter;
