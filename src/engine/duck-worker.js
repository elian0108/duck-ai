const EventEmitter = require('events');
const { resolveModel } = require('../models');

function extractContentText(content) {
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
        if (part.content) return extractContentText(part.content);
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

class DuckWorker extends EventEmitter {
  constructor(id, browser, config) {
    super();
    this.id = id;
    this.browser = browser;
    this.config = config;
    this.page = null;
    this.isBusy = false;
    this.isReady = false;
    this.currentModelId = null;
    this.activeStreamCallback = null;
    this.createdAt = Date.now();
    this.totalRequests = 0;
  }

  async init() {
    this.page = await this.browser.newPage();
    
    // Stealth overrides
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    // Expose stream chunk handler from page to Node
    await this.page.exposeFunction('__onDuckStreamChunk', (data) => {
      if (this.activeStreamCallback) {
        this.activeStreamCallback(data);
      }
    });

    // Inject stream interceptor
    await this.page.evaluateOnNewDocument(() => {
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (url.includes('/duckchat/v1/chat')) {
          const clone = res.clone();
          (async () => {
            const reader = clone.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (window.__onDuckStreamChunk) window.__onDuckStreamChunk({ done: true });
                break;
              }
              const text = decoder.decode(value, { stream: true });
              if (window.__onDuckStreamChunk) window.__onDuckStreamChunk({ text });
            }
          })().catch(err => {
            if (window.__onDuckStreamChunk) window.__onDuckStreamChunk({ error: err.message });
          });
        }
        return res;
      };
    });

    // Navigate to duck.ai (domcontentloaded avoids long-running tracker network idle timeouts)
    await this.page.goto('https://duck.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await this.page.waitForSelector('textarea', { timeout: 15000 });

    // Handle initial terms agreement banner if present
    await this.acceptTermsIfPresent();

    this.currentModelId = 'gpt-6-luna';
    this.isReady = true;
    console.log(`[Worker ${this.id}] Initialized and ready!`);
  }

  async acceptTermsIfPresent() {
    try {
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const b of btns) {
          const txt = b.textContent.trim().toLowerCase();
          if (txt.includes('continuar') || txt.includes('continue') || txt.includes('aceitar') || txt.includes('entendi!')) {
            b.click();
            break;
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Switch the model in the Duck.ai UI if needed
   */
  async switchModelIfNeeded(targetModel) {
    if (this.currentModelId === targetModel.id) {
      return;
    }

    console.log(`[Worker ${this.id}] Switching model from ${this.currentModelId} to ${targetModel.name}...`);

    try {
      // Find model dropdown button (data-testid or label fallback)
      const opened = await this.page.evaluate(() => {
        const testidBtn = document.querySelector('[data-testid="model-picker-button"]');
        if (testidBtn) {
          testidBtn.click();
          return true;
        }
        const btns = Array.from(document.querySelectorAll('button'));
        for (const b of btns) {
          const txt = b.textContent.trim();
          const aria = b.getAttribute('aria-label') || '';
          if (
            txt.includes('Luna') || txt.includes('GPT') || txt.includes('Claude') ||
            txt.includes('Mistral') || txt.includes('Gemma') || txt.includes('oss') ||
            aria.includes('Mudar de modelo')
          ) {
            b.click();
            return true;
          }
        }
        return false;
      });

      if (opened) {
        await new Promise(r => setTimeout(r, 500));

        // Click the target model item
        const clicked = await this.page.evaluate((targetUiPattern) => {
          const items = Array.from(document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], button'));
          for (const item of items) {
            const txt = item.textContent.trim().replace(/\s+/g, ' ');
            if (txt.includes(targetUiPattern)) {
              item.click();
              return true;
            }
          }
          return false;
        }, targetModel.uiRolePattern);

        if (clicked) {
          this.currentModelId = targetModel.id;
          console.log(`[Worker ${this.id}] Successfully switched to ${targetModel.name}`);
          await new Promise(r => setTimeout(r, 500));
          return;
        }
      }
    } catch (err) {
      console.warn(`[Worker ${this.id}] Error switching model:`, err.message);
    }

    this.currentModelId = targetModel.id;
  }

  /**
   * Reset conversation state for the next request
   */
  async resetChat() {
    try {
      const resetClicked = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        for (const b of btns) {
          const txt = b.textContent.trim();
          const aria = b.getAttribute('aria-label') || '';
          if (txt === 'Novo' || aria.includes('Novo chat') || aria.includes('Limpar')) {
            b.click();
            return true;
          }
        }
        return false;
      });

      if (resetClicked) {
        await new Promise(r => setTimeout(r, 400));
      } else {
        await this.page.goto('https://duck.ai', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await this.acceptTermsIfPresent();
      }
    } catch (e) {
      try {
        await this.page.goto('https://duck.ai', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (err) {}
    }
  }

  /**
   * Execute chat completion
   * @param {Object} options
   * @param {string} options.model - model id or alias
   * @param {Array} options.messages - [{role, content}]
   * @param {Function} options.onToken - callback for streaming tokens
   * @param {AbortSignal} options.signal - abort signal
   */
  async chat({ model, messages, onToken, signal }) {
    this.isBusy = true;
    this.totalRequests++;

    const targetModel = resolveModel(model);
    console.log(`[Worker ${this.id}] Starting chat request for model: ${targetModel.name}...`);

    let timer = null;
    try {
      // Ensure page is in foreground for event delivery
      await this.page.bringToFront();

      // Dismiss any popovers if present
      await this.acceptTermsIfPresent();

      // Switch model if different
      await this.switchModelIfNeeded(targetModel);

      // Build consolidated prompt from messages
      let promptText = '';
      if (Array.isArray(messages)) {
        if (messages.length === 1) {
          promptText = extractContentText(messages[0].content);
        } else {
          // Format conversation context
          promptText = messages
            .map(m => {
              const roleName = m.role === 'user' ? 'User' : m.role === 'system' ? 'System' : 'Assistant';
              return `${roleName}: ${extractContentText(m.content)}`;
            })
            .join('\n\n') + '\n\nAssistant:';
        }
      } else if (typeof messages === 'string') {
        promptText = messages;
      }

      if (!promptText.trim()) {
        throw new Error('Prompt messages cannot be empty.');
      }

      // Prepare promise for completion
      let fullResponseText = '';
      let isCompleted = false;

      const completionPromise = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          if (!isCompleted) {
            isCompleted = true;
            if (fullResponseText.length > 0) {
              console.log(`[Worker ${this.id}] Completed via timeout fallback with ${fullResponseText.length} chars.`);
              resolve(fullResponseText);
            } else {
              reject(new Error(`Timeout waiting for response from Duck.ai (${this.config.requestTimeoutMs}ms)`));
            }
          }
        }, this.config.requestTimeoutMs);

        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            isCompleted = true;
            reject(new Error('Request aborted by client'));
          });
        }

        this.activeStreamCallback = (data) => {
          if (isCompleted) return;

          if (data.error) {
            clearTimeout(timer);
            isCompleted = true;
            reject(new Error(data.error));
            return;
          }

          if (data.done) {
            clearTimeout(timer);
            isCompleted = true;
            console.log(`[Worker ${this.id}] Stream done. Total chars: ${fullResponseText.length}`);
            resolve(fullResponseText);
            return;
          }

          if (data.text) {
            const lines = data.text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') {
                  clearTimeout(timer);
                  isCompleted = true;
                  console.log(`[Worker ${this.id}] Stream [DONE]. Total chars: ${fullResponseText.length}`);
                  resolve(fullResponseText);
                  return;
                }
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed.message) {
                    fullResponseText += parsed.message;
                    if (onToken) {
                      onToken(parsed.message);
                    }
                  }
                } catch (e) {}
              }
            }
          }
        };
      });

      // Stop any ongoing generation from a previous incomplete request
      await this.page.evaluate(() => {
        const stopBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const aria = b.getAttribute('aria-label') || '';
          return aria.includes('Parar de gerar') || aria.includes('Stop');
        });
        if (stopBtn && !stopBtn.disabled) stopBtn.click();
      });

      // Duck.ai textarea strictly disables the 'Perguntar' submit button if length > 16000
      // We compact strictly to 11500 chars to maintain a reliable safety margin
      if (promptText.length > 11500) {
        console.log(`[Worker ${this.id}] Compacting prompt (${promptText.length} -> 11500 chars) to stay safely within Duck.ai limit...`);
        let cleaned = promptText.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '');
        if (cleaned.length > 11500) {
          cleaned = cleaned.slice(0, 3000) + '\n\n[...context compacted for model limit...]\n\n' + cleaned.slice(-8500);
        }
        promptText = cleaned;
      }

      // Wait for textarea to appear
      await this.page.waitForSelector('textarea[name="user-prompt"], textarea', { timeout: 10000 });

      console.log(`[Worker ${this.id}] Inserting prompt (${promptText.length} chars)...`);
      await this.page.evaluate((text) => {
        const el = document.querySelector('textarea[name="user-prompt"], textarea');
        if (el) {
          el.focus();
          // Use HTMLTextAreaElement prototype value setter for reliable React state update
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, text);
          } else {
            el.value = text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, promptText);

      // Give React a brief moment to update button state
      await new Promise(r => setTimeout(r, 250));

      // Verify button status and click inside page context
      console.log(`[Worker ${this.id}] Submitting prompt...`);
      const submitResult = await this.page.evaluate(() => {
        const textarea = document.querySelector('textarea[name="user-prompt"], textarea');
        const form = textarea ? textarea.closest('form') : document;
        const btns = Array.from(form ? form.querySelectorAll('button') : document.querySelectorAll('button'));
        const askBtn = btns.find(b => {
          const t = b.textContent.trim();
          const aria = b.getAttribute('aria-label') || '';
          return b.type === 'submit' || t.includes('Perguntar') || t.includes('Ask') || aria.includes('Perguntar') || aria.includes('Send') || aria.includes('Enviar');
        });

        if (askBtn) {
          if (askBtn.disabled) {
            return { success: false, disabled: true, text: askBtn.textContent.trim() };
          }
          askBtn.click();
          return { success: true };
        }
        return { success: false, notFound: true };
      });

      if (!submitResult.success) {
        if (submitResult.disabled) {
          throw new Error('Duck.ai submit button is disabled. The prompt might exceed Duck.ai limit or Duck.ai is busy.');
        }
        await this.page.keyboard.press('Enter');
      }

      // Await the stream completion
      completionPromise.catch(() => {}); // prevent dangling unhandled rejection
      const result = await completionPromise;

      // Clean chat for next caller asynchronously
      this.resetChat().catch(() => {});

      return {
        text: result.trim(),
        model: targetModel.id,
        modelName: targetModel.name
      };

    } finally {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      this.activeStreamCallback = null;
      this.isBusy = false;
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
      }
    } catch (e) {}
  }
}

module.exports = DuckWorker;
