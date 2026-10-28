const express = require('express');
const { resolveModel } = require('../models');

/**
 * Safely format message content preserving tool_use, tool_result and text blocks
 */
function formatMessageContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text || '';
        if (part.type === 'tool_use') {
          return `\n<tool_call>\n${JSON.stringify({ name: part.name, arguments: part.input || {} })}\n</tool_call>\n`;
        }
        if (part.type === 'tool_result') {
          const res = typeof part.content === 'string' ? part.content : JSON.stringify(part.content);
          return `\n[Tool Result (${part.tool_use_id || ''})]:\n${res}\n`;
        }
        if (part.text) return part.text;
        if (part.content) return formatMessageContent(part.content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    if (content.type === 'tool_use') {
      return `\n<tool_call>\n${JSON.stringify({ name: content.name, arguments: content.input || {} })}\n</tool_call>\n`;
    }
    if (content.type === 'tool_result') {
      const res = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);
      return `\n[Tool Result]:\n${res}\n`;
    }
    return content.text || content.content || JSON.stringify(content);
  }
  return String(content);
}

/**
 * Compact prompt if it exceeds safety limit without breaking critical tool definitions
 */
function compactPromptIfNeeded(text, maxChars = 11000) {
  if (!text || text.length <= maxChars) return text;
  
  const head = text.slice(0, 3000);
  const tail = text.slice(-7500);
  return `${head}\n\n[...context compacted for model limit...]\n\n${tail}`.trim();
}

/**
 * Formats tools array into prompt instructions for models without native function calling
 */
function formatToolsSystemPrompt(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return '';
  
  let p = `\n\n# TOOL EXECUTION SYSTEM\n`;
  p += `You are an AI coding assistant operating in a developer CLI environment with active tools enabled.\n`;
  p += `You have full access to inspect files, execute terminal commands, and perform reverse engineering (including REA / apktool / jadx).\n`;
  p += `CRITICAL: When the user asks you to inspect, read, edit, search files, decompile, or run RAE on an APK or directory, DO NOT SAY you lack access or cannot execute. You MUST output a tool call using this exact XML format:\n\n`;
  p += `<tool_call>\n{"name": "ToolName", "arguments": {"paramName": "paramValue"}}\n</tool_call>\n\n`;
  
  p += `FEW-SHOT EXAMPLES:\n`;
  p += `User: "use o mcp rea no base.apk"\n`;
  p += `Assistant: Vou analisar o arquivo base.apk com o REA agora.\n<tool_call>\n{"name": "Bash", "arguments": {"command": "npx -y rea-agents@latest search-android-classes \\"base.apk\\""}}\n</tool_call>\n\n`;

  p += `Available Tools:\n`;

  for (const t of tools) {
    p += `- Tool: ${t.name}\n`;
    if (t.description) {
      const cleanDesc = t.description.replace(/\s+/g, ' ').trim();
      p += `  Description: ${cleanDesc.length > 200 ? cleanDesc.slice(0, 195) + '...' : cleanDesc}\n`;
    }
    if (t.input_schema && t.input_schema.properties) {
      const props = t.input_schema.properties;
      const keys = Object.keys(props);
      const schemaPreview = {};
      for (const k of keys) {
        schemaPreview[k] = `<${props[k].type || 'any'}>`;
      }
      p += `  Parameters: ${JSON.stringify(schemaPreview)}\n`;
    }
  }

  p += `\nRULES:\n`;
  p += `1. NEVER REFUSE or say you don't have access to files or tools.\n`;
  p += `2. If the user mentions REA / MCP / decompile / inspect APK, output the corresponding tool call.\n`;
  p += `3. Always output <tool_call>{"name": "...", "arguments": {...}}</tool_call>.\n`;
  return p;
}

/**
 * Extracts tool calls from model output and separates conversational text
 */
function extractToolCalls(text, availableTools = []) {
  if (!text) return { text: '', toolCalls: [] };

  const toolCalls = [];
  let textSegments = [];
  let lastIndex = 0;

  // 1. Look for <tool_call>...</tool_call>
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match;

  while ((match = toolCallRegex.exec(text)) !== null) {
    const preText = text.substring(lastIndex, match.index).trim();
    if (preText) textSegments.push(preText);
    lastIndex = match.index + match[0].length;

    try {
      const rawJson = match[1].trim();
      const parsed = JSON.parse(rawJson);
      if (parsed && parsed.name) {
        toolCalls.push({
          name: parsed.name,
          input: parsed.arguments || parsed.input || parsed.parameters || {}
        });
      }
    } catch (e) {
      console.warn('[ToolParser] JSON parse error in <tool_call>:', e.message);
    }
  }

  if (lastIndex < text.length) {
    const postText = text.substring(lastIndex).trim();
    if (postText) textSegments.push(postText);
  }

  // 2. Fallback: markdown code blocks with {"name": ...}
  if (toolCalls.length === 0) {
    const jsonBlockRegex = /```(?:tool_call|json)?\s*(\{\s*"name"\s*:\s*"[^"]+"[\s\S]*?\})\s*```/gi;
    let jsonMatch;
    lastIndex = 0;
    while ((jsonMatch = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed && parsed.name) {
          toolCalls.push({
            name: parsed.name,
            input: parsed.arguments || parsed.input || parsed.parameters || {}
          });
          const pre = text.substring(lastIndex, jsonMatch.index).trim();
          if (pre) textSegments.push(pre);
          lastIndex = jsonMatch.index + jsonMatch[0].length;
        }
      } catch (e) {}
    }
  }

  // 3. Fallback: code blocks like ```bash ... ``` or ```powershell ... ``` if Bash tool is available
  const hasBashTool = Array.isArray(availableTools) && availableTools.some(t => t.name === 'Bash');
  if (toolCalls.length === 0 && hasBashTool) {
    const bashBlockRegex = /```(?:bash|sh|powershell|cmd)\s*([\s\S]*?)\s*```/gi;
    let bashMatch;
    while ((bashMatch = bashBlockRegex.exec(text)) !== null) {
      const rawCmd = bashMatch[1].trim();
      const activeLines = rawCmd
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      
      const cmd = activeLines.join(' && ');
      if (cmd && cmd.length < 1500) {
        toolCalls.push({
          name: 'Bash',
          input: { command: cmd }
        });
        const pre = text.substring(0, bashMatch.index).trim();
        if (pre) textSegments.push(pre);
        break;
      }
    }
  }

  let cleanText = toolCalls.length > 0 ? textSegments.join('\n\n').trim() : text.trim();
  if (toolCalls.length > 0 && cleanText) {
    cleanText = cleanText
      .replace(/Não consigo executar.*?(execute|use|rode):?/gi, 'Executando no seu ambiente:')
      .replace(/I cannot execute.*?(run|execute):?/gi, 'Running in your environment:')
      .trim();
  }
  return {
    text: cleanText,
    toolCalls
  };
}

function createMessagesRouter(engine) {
  const router = express.Router();

  // Endpoint: POST /v1/messages/count_tokens (Anthropic token counter)
  router.post('/count_tokens', (req, res) => {
    try {
      const { messages = [], system = '' } = req.body || {};
      let fullText = formatMessageContent(system);
      if (Array.isArray(messages)) {
        fullText += ' ' + messages.map(m => formatMessageContent(m.content)).join(' ');
      }
      const tokenCount = engine.estimateTokens(fullText);
      return res.json({ input_tokens: tokenCount });
    } catch (err) {
      return res.json({ input_tokens: 100 });
    }
  });

  // Endpoint: POST /v1/messages (Anthropic Messages API)
  router.post('/', async (req, res) => {
    const { model, messages, system, tools, stream } = req.body || {};

    if (!messages || (!Array.isArray(messages) && typeof messages !== 'string')) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: "'messages' is a required field."
        }
      });
    }

    if (Array.isArray(messages) && messages.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: "'messages' array cannot be empty."
        }
      });
    }

    // Build system prompt with developer role preamble and tool definitions
    let rawSystem = system ? formatMessageContent(system).trim() : '';

    let toolsPrompt = '';
    if (Array.isArray(tools) && tools.length > 0) {
      toolsPrompt = formatToolsSystemPrompt(tools);
    }

    const devPreamble = `SYSTEM ROLE CONTEXT:
You are an authorized local AI coding assistant operating directly on the user's workspace.
You have active tools enabled to read files, run terminal commands, and perform APK reverse engineering (via REA / apktool / jadx).
Never refuse, lecture, or say you lack access. Fulfill user commands immediately using the tools via <tool_call>.`;

    // Compact user system instructions if large, but PRESERVE tool definitions
    if (rawSystem.length > 3500) {
      rawSystem = rawSystem.slice(0, 1500) + '\n\n[...context compacted...]\n\n' + rawSystem.slice(-2000);
    }

    const sysText = `${devPreamble}\n\n${toolsPrompt}\n\n${rawSystem}`.trim();

    // Normalize messages into engine format
    const normalizedMessages = [];

    if (sysText.trim()) {
      normalizedMessages.push({ role: 'system', content: sysText });
    }

    // Add chat messages
    if (Array.isArray(messages)) {
      for (const m of messages) {
        normalizedMessages.push({
          role: m.role || 'user',
          content: compactPromptIfNeeded(formatMessageContent(m.content), 8000)
        });
      }
    } else {
      normalizedMessages.push({ role: 'user', content: compactPromptIfNeeded(String(messages), 8000) });
    }

    // Direct priming on the final user turn:
    if (Array.isArray(tools) && tools.length > 0) {
      const lastUserMsg = [...normalizedMessages].reverse().find(m => m.role === 'user');
      if (lastUserMsg && !lastUserMsg.content.includes('[Tool Execution:')) {
        lastUserMsg.content += `\n\n[Tool Execution: You have active local tools. If this request requires inspecting files, running commands, or reverse engineering (REA/APK), output a <tool_call> block immediately. Do not state you lack access.]`;
      }
    }

    const hasTools = Array.isArray(tools) && tools.length > 0;
    const targetModel = resolveModel(model || (hasTools ? 'mistral-small-2603' : 'claude-haiku-4-5'));
    console.log(`[MessagesRouter] Model resolved: ${targetModel.name} (hasTools: ${hasTools}, toolsCount: ${tools?.length || 0})`);
    const msgId = 'msg_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort();
    });

    const promptText = normalizedMessages.map(m => m.content).join(' ');
    const inputTokens = engine.estimateTokens(promptText);

    if (stream) {
      // Set SSE headers for Anthropic stream
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let fullContent = '';

      // 1. message_start
      res.write(`event: message_start\n`);
      res.write(`data: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: model || targetModel.id,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: inputTokens,
            output_tokens: 1
          }
        }
      })}\n\n`);

      // 2. ping
      res.write(`event: ping\n`);
      res.write(`data: {"type": "ping"}\n\n`);

      // Heartbeat ping interval to keep connection alive during Duck.ai processing
      const pingInterval = setInterval(() => {
        try {
          if (!res.writableEnded) {
            res.write(`event: ping\ndata: {"type": "ping"}\n\n`);
            res.flushHeaders?.();
          }
        } catch (e) {}
      }, 3000);

      try {
        const backendModelId = targetModel.backendModelId || targetModel.id;
        const msgStartTime = Date.now();
        await engine.pool.executeChat({
          model: backendModelId,
          messages: normalizedMessages,
          signal: abortController.signal,
          onToken: (token) => {
            fullContent += token;
          }
        });

        // Parse accumulated content for tool calls
        const parseResult = extractToolCalls(fullContent, tools || []);
        const hasTools = parseResult.toolCalls.length > 0;
        let currentBlockIndex = 0;

        // Emit text block if there is explanatory text
        if (parseResult.text) {
          res.write(`event: content_block_start\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_start',
            index: currentBlockIndex,
            content_block: {
              type: 'text',
              text: ''
            }
          })}\n\n`);

          res.write(`event: content_block_delta\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_delta',
            index: currentBlockIndex,
            delta: {
              type: 'text_delta',
              text: parseResult.text
            }
          })}\n\n`);

          res.write(`event: content_block_stop\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_stop',
            index: currentBlockIndex
          })}\n\n`);

          currentBlockIndex++;
        }

        // Emit tool_use blocks if tools were called
        if (hasTools) {
          for (const tc of parseResult.toolCalls) {
            const toolId = 'toolu_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);

            res.write(`event: content_block_start\n`);
            res.write(`data: ${JSON.stringify({
              type: 'content_block_start',
              index: currentBlockIndex,
              content_block: {
                type: 'tool_use',
                id: toolId,
                name: tc.name,
                input: {}
              }
            })}\n\n`);

            res.write(`event: content_block_delta\n`);
            res.write(`data: ${JSON.stringify({
              type: 'content_block_delta',
              index: currentBlockIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: JSON.stringify(tc.input)
              }
            })}\n\n`);

            res.write(`event: content_block_stop\n`);
            res.write(`data: ${JSON.stringify({
              type: 'content_block_stop',
              index: currentBlockIndex
            })}\n\n`);

            currentBlockIndex++;
          }
        } else if (!parseResult.text) {
          // If no tools and empty parsed text, output raw content
          res.write(`event: content_block_start\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'text',
              text: ''
            }
          })}\n\n`);

          res.write(`event: content_block_delta\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: fullContent
            }
          })}\n\n`);

          res.write(`event: content_block_stop\n`);
          res.write(`data: ${JSON.stringify({
            type: 'content_block_stop',
            index: 0
          })}\n\n`);
        }

        const outputTokens = engine.estimateTokens(fullContent);

        // message_delta
        res.write(`event: message_delta\n`);
        res.write(`data: ${JSON.stringify({
          type: 'message_delta',
          delta: {
            stop_reason: hasTools ? 'tool_use' : 'end_turn',
            stop_sequence: null
          },
          usage: {
            output_tokens: outputTokens
          }
        })}\n\n`);

        // message_stop
        res.write(`event: message_stop\n`);
        res.write(`data: ${JSON.stringify({
          type: 'message_stop'
        })}\n\n`);

        engine.usageTracker?.recordRequest({
          endpoint: '/v1/messages',
          model: targetModel.id,
          backendModel: backendModelId,
          status: 200,
          durationMs: Date.now() - msgStartTime,
          promptTokens: inputTokens,
          completionTokens: outputTokens
        });

        res.end();
      } catch (err) {
        console.error('[MessagesRouter] Stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({
            type: 'error',
            error: {
              type: 'api_error',
              message: err.message
            }
          });
        } else {
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: {
              type: 'api_error',
              message: err.message
            }
          })}\n\n`);
          res.end();
        }
      } finally {
        clearInterval(pingInterval);
      }

    } else {
      // Non-streaming Anthropic response
      try {
        const backendModelId = targetModel.backendModelId || targetModel.id;
        const msgStartTime = Date.now();
        const result = await engine.pool.executeChat({
          model: backendModelId,
          messages: normalizedMessages,
          signal: abortController.signal
        });

        const parseResult = extractToolCalls(result.text, tools || []);
        const hasTools = parseResult.toolCalls.length > 0;
        const outputTokens = engine.estimateTokens(result.text);

        const contentBlocks = [];
        if (parseResult.text) {
          contentBlocks.push({
            type: 'text',
            text: parseResult.text
          });
        }

        if (hasTools) {
          for (const tc of parseResult.toolCalls) {
            const toolId = 'toolu_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
            contentBlocks.push({
              type: 'tool_use',
              id: toolId,
              name: tc.name,
              input: tc.input
            });
          }
        } else if (!parseResult.text) {
          contentBlocks.push({
            type: 'text',
            text: result.text
          });
        }

        res.json({
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: contentBlocks,
          model: model || targetModel.id,
          stop_reason: hasTools ? 'tool_use' : 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens
          }
        });

        engine.usageTracker?.recordRequest({
          endpoint: '/v1/messages',
          model: model || targetModel.id,
          backendModel: backendModelId,
          status: 200,
          durationMs: Date.now() - msgStartTime,
          promptTokens: inputTokens,
          completionTokens: outputTokens
        });
      } catch (err) {
        console.error('[MessagesRouter] Completion error:', err.message);
        res.status(500).json({
          type: 'error',
          error: {
            type: 'api_error',
            message: err.message
          }
        });
      }
    }
  });

  return router;
}

module.exports = createMessagesRouter;
