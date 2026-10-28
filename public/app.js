/**
 * DuckAI API Gateway - Official Duck.ai Models & Capacity Monitor
 */

let selectedModelId = 'mistral-small-2603';
let currentSnippetTab = 'tab-curl';
let localResetSeconds = 0;

// Dynamic Snippet Generator focusing strictly on official Duck.ai models
function getSnippet(tab, modelId) {
  const currentModel = modelId || 'mistral-small-2603';
  
  const snippets = {
    'tab-curl': {
      filename: 'Requisição cURL (Terminal / Shell)',
      code: `curl http://127.0.0.1:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${currentModel}",
    "messages": [
      {"role": "user", "content": "Olá, Duck.ai!"}
    ],
    "stream": true
  }'`
    },
    'tab-python': {
      filename: 'Python (SDK OpenAI Oficial)',
      code: `from openai import OpenAI

# Conecta ao Gateway Duck.ai local
client = OpenAI(
    base_url="http://127.0.0.1:3000/v1",
    api_key="none"
)

# Modelos oficiais do Duck.ai:
# - mistral-small-2603 (Mistral Small 4 - Tools & Dev)
# - gpt-6-luna (GPT-6 Luna - Raciocínio & Versatilidade)
# - claude-haiku-4-5 (Claude Haiku 4.5 - Código & Síntese)
# - gpt-5.4-mini (GPT-5.4 mini - Ultrarrápido)
# - tinfoil/gpt-oss-120b (gpt-oss 120B - Enclave Privado)
# - tinfoil/gemma4-31b (Gemma 4 31B Beta - Google)

response = client.chat.completions.create(
    model="${currentModel}",
    messages=[
        {"role": "user", "content": "Explique o modelo Duck.ai em 2 frases."}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`
    },
    'tab-node': {
      filename: 'Node.js / TypeScript (OpenAI SDK)',
      code: `import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:3000/v1',
  apiKey: 'none'
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: '${currentModel}',
    messages: [{ role: 'user', content: 'Olá do Duck.ai!' }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main().catch(console.error);`
    },
    'tab-yaml': {
      filename: 'settings.yaml (DeepSeek Harness / dsh)',
      code: `# Configuração do DeepSeek Harness (settings.yaml)
# Utilizando exclusivamente os modelos oficiais do Duck.ai:
llm-pi-ai:
  providers:
    duck-ai:
      api: openai-completions
      baseURL: http://127.0.0.1:3000/v1
      apiKey: none
      models:
        - id: mistral-small-2603
        - id: gpt-6-luna
        - id: claude-haiku-4-5
        - id: gpt-5.4-mini
        - id: tinfoil/gpt-oss-120b
        - id: tinfoil/gemma4-31b`
    },
    'tab-env': {
      filename: '.env (Variáveis de Ambiente)',
      code: `# Conexão universal com o Gateway Duck.ai:
OPENAI_BASE_URL=http://127.0.0.1:3000/v1
OPENAI_API_KEY=none

# Modelo Duck.ai padrão selecionado:
DEFAULT_MODEL=${currentModel}`
    }
  };

  return snippets[tab] || snippets['tab-curl'];
}

// DOM Elements
const endpointText = document.getElementById('endpoint-text');
const btnCopyEndpoint = document.getElementById('btn-copy-endpoint');
const btnManualRefresh = document.getElementById('btn-manual-refresh');
const resetTimerVal = document.getElementById('reset-timer-val');
const quotaRing = document.getElementById('quota-ring');
const quotaPercentVal = document.getElementById('quota-percent-val');
const remainingQuotaNum = document.getElementById('remaining-quota-num');
const quotaBarFill = document.getElementById('quota-bar-fill');
const usedTodayNum = document.getElementById('used-today-num');
const dailyQuotaNum = document.getElementById('daily-quota-num');
const rateLimitBanner = document.getElementById('rate-limit-banner');
const rateLimitIcon = document.getElementById('rate-limit-icon');
const rateLimitTitle = document.getElementById('rate-limit-title');
const rateLimitSubtitle = document.getElementById('rate-limit-subtitle');
const workersBadge = document.getElementById('workers-badge');
const workersSlotsContainer = document.getElementById('workers-slots-container');

// Metrics
const metricTotalRequests = document.getElementById('metric-total-requests');
const metricTodaySub = document.getElementById('metric-today-sub');
const metricTotalTokens = document.getElementById('metric-total-tokens');
const metricTokensSub = document.getElementById('metric-tokens-sub');
const metricAvgLatency = document.getElementById('metric-avg-latency');
const metricSuccessRate = document.getElementById('metric-success-rate');
const metricUptimeSub = document.getElementById('metric-uptime-sub');

// Snippet Elements
const snippetFilename = document.getElementById('snippet-filename');
const snippetContent = document.getElementById('snippet-content');
const btnCopyCode = document.getElementById('btn-copy-code');
const modelsActiveCounter = document.getElementById('models-active-counter');
const modelBarsContainer = document.getElementById('model-bars-container');

// Live feed
const feedCountBadge = document.getElementById('feed-count-badge');
const liveFeedTbody = document.getElementById('live-feed-tbody');

// Toast
const toastNotify = document.getElementById('toast-notify');
const toastMsg = document.getElementById('toast-msg');

// Interactive Tester elements
const testerModelSelect = document.getElementById('tester-model-select');
const testerPromptInput = document.getElementById('tester-prompt-input');
const btnRunTest = document.getElementById('btn-run-test');
const btnRunText = document.getElementById('btn-run-text');
const testerOutputBox = document.getElementById('tester-output-box');
const outputStatusStat = document.getElementById('output-status-stat');
const outputLatencyStat = document.getElementById('output-latency-stat');

function showToast(message) {
  toastMsg.textContent = message;
  toastNotify.classList.add('show');
  setTimeout(() => {
    toastNotify.classList.remove('show');
  }, 2600);
}

function formatNumber(num) {
  return new Intl.NumberFormat('pt-BR').format(num || 0);
}

function formatUptime(seconds) {
  if (!seconds || seconds < 60) return `${seconds || 0}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function formatCountdown(sec) {
  if (sec <= 0) return '00h 00m 00s';
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function updateSnippetDisplay() {
  const item = getSnippet(currentSnippetTab, selectedModelId);
  if (snippetFilename) snippetFilename.textContent = item.filename;
  if (snippetContent) snippetContent.textContent = item.code;
}

// Select active model
function setSelectedModel(modelId, shouldScrollToConsole = false) {
  selectedModelId = modelId;
  
  // Update tester dropdown
  if (testerModelSelect) {
    testerModelSelect.value = modelId;
  }

  // Update active styling on showcase cards
  document.querySelectorAll('.duck-model-card').forEach(card => {
    if (card.dataset.modelId === modelId) {
      card.classList.add('active-selected');
    } else {
      card.classList.remove('active-selected');
    }
  });

  // Update snippet
  updateSnippetDisplay();

  if (shouldScrollToConsole) {
    const consoleArea = document.getElementById('live-console-area');
    if (consoleArea) {
      consoleArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// Tab navigation for code snippets
document.querySelectorAll('.code-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSnippetTab = btn.dataset.tab;
    updateSnippetDisplay();
  });
});

// Filter pills for showcase models
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;

    document.querySelectorAll('.duck-model-card').forEach(card => {
      const provider = card.dataset.provider || '';
      if (filter === 'all' || provider.toLowerCase().includes(filter.toLowerCase())) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

// Card "Testar no Console" buttons
document.querySelectorAll('[data-select-model]').forEach(btn => {
  btn.addEventListener('click', () => {
    const model = btn.dataset.selectModel;
    setSelectedModel(model, true);
    showToast(`Modelo selecionado para teste: ${model}`);
  });
});

// Copy model ID buttons
document.querySelectorAll('.btn-copy-model-id').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(id);
      setSelectedModel(id, false);
      showToast(`ID do modelo Duck.ai copiado: ${id}`);
    } catch (err) {
      showToast(id);
    }
  });
});

// Model selector dropdown in tester
if (testerModelSelect) {
  testerModelSelect.addEventListener('change', () => {
    setSelectedModel(testerModelSelect.value, false);
  });
}

// Preset prompt buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (testerPromptInput) {
      testerPromptInput.value = btn.dataset.prompt;
    }
  });
});

// Interactive Tester Execution (Streaming SSE)
let isTesting = false;
if (btnRunTest) {
  btnRunTest.addEventListener('click', async () => {
    if (isTesting) return;

    const prompt = testerPromptInput?.value?.trim();
    if (!prompt) {
      showToast('Digite uma mensagem antes de enviar.');
      return;
    }

    const model = testerModelSelect?.value || selectedModelId;
    isTesting = true;
    btnRunTest.disabled = true;
    btnRunText.textContent = 'Processando...';
    outputStatusStat.textContent = 'Status: Conectando...';
    outputLatencyStat.textContent = 'Latência: Calculando...';
    testerOutputBox.innerHTML = '';

    const startTime = Date.now();
    let firstChunkTime = null;
    let fullOutput = '';

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-client'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      outputStatusStat.textContent = 'Status: 200 OK (Transmitindo)';

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!firstChunkTime) {
          firstChunkTime = Date.now() - startTime;
          outputLatencyStat.textContent = `Latência 1º Token: ${firstChunkTime}ms`;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content || '';
            if (deltaContent) {
              fullOutput += deltaContent;
              testerOutputBox.textContent = fullOutput;
              testerOutputBox.scrollTop = testerOutputBox.scrollHeight;
            }
          } catch (e) {
            // non-json chunk
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      outputStatusStat.textContent = 'Status: Concluído ✓';
      outputLatencyStat.textContent = `Tempo total: ${totalDuration}ms`;
      showToast(`Resposta do modelo ${model} recebida com sucesso!`);
      
      // Refresh telemetry
      setTimeout(fetchStats, 500);

    } catch (err) {
      console.error('[Tester Error]', err);
      outputStatusStat.textContent = 'Status: Erro ❌';
      testerOutputBox.innerHTML = `<span style="color: #EF4444;">Erro ao consultar ${model}: ${err.message}</span>`;
      showToast(`Erro: ${err.message}`);
    } finally {
      isTesting = false;
      btnRunTest.disabled = false;
      btnRunText.textContent = 'Enviar Requisição';
    }
  });
}

// Copy Base URL
btnCopyEndpoint.addEventListener('click', async () => {
  const url = endpointText.textContent.trim();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Base URL copiada: ' + url);
  } catch (err) {
    showToast('Base URL: ' + url);
  }
});

// Copy snippet code
btnCopyCode.addEventListener('click', async () => {
  const text = snippetContent.textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Código copiado para a área de transferência!');
  } catch (err) {
    showToast('Copiado!');
  }
});

// Manual refresh
btnManualRefresh.addEventListener('click', () => {
  fetchStats();
  showToast('Métricas atualizadas!');
});

// Fetch stats from server
async function fetchStats() {
  try {
    const res = await fetch('/api/usage');
    if (!res.ok) throw new Error('Falha ao carregar métricas');
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    console.warn('[Dashboard] Erro ao buscar métricas:', err.message);
  }
}

function renderDashboard(data) {
  const { capacity = {}, usage = {}, recentLogs = [], uptimeSeconds = 0 } = data;

  // 1. Capacity & Quota Hero
  const remaining = capacity.remainingToday ?? 150;
  const dailyQuota = capacity.dailyQuota ?? 150;
  const usedToday = capacity.requestsToday ?? 0;
  const percentRemaining = capacity.percentRemaining ?? 100;

  remainingQuotaNum.textContent = formatNumber(remaining);
  usedTodayNum.textContent = formatNumber(usedToday);
  dailyQuotaNum.textContent = formatNumber(dailyQuota);
  quotaPercentVal.textContent = `${percentRemaining}%`;

  // Update SVG Ring (circumference = 2 * PI * 68 = ~427.26)
  const circumference = 427.26;
  const offset = circumference - (percentRemaining / 100) * circumference;
  quotaRing.style.strokeDashoffset = offset;

  // Linear bar
  quotaBarFill.style.width = `${percentRemaining}%`;
  if (percentRemaining < 20) {
    quotaBarFill.style.background = 'linear-gradient(90deg, #EF4444, #F59E0B)';
  } else {
    quotaBarFill.style.background = 'linear-gradient(90deg, #10B981, #06B6D4)';
  }

  // Countdown timer
  localResetSeconds = capacity.secondsToReset || 0;
  resetTimerVal.textContent = formatCountdown(localResetSeconds);

  // Rate limit status banner
  if (capacity.isRateLimited) {
    rateLimitBanner.className = 'health-alert-box limited';
    rateLimitIcon.textContent = '⚠️';
    rateLimitTitle.textContent = 'Alerta de Limite Temporário Detectado';
    const until = capacity.limitedUntil ? new Date(capacity.limitedUntil).toLocaleTimeString() : '';
    rateLimitSubtitle.textContent = `Aguardando cooldown de taxa do Duck.ai até ${until}. O gateway aguardará a liberação em instantes.`;
  } else {
    rateLimitBanner.className = 'health-alert-box normal';
    rateLimitIcon.textContent = '🟢';
    rateLimitTitle.textContent = 'Backend Duck.ai 100% Operacional';
    rateLimitSubtitle.textContent = 'Sem restrições ou limitações de taxa ativas. Pronto para receber chamadas em todos os modelos oficiais.';
  }

  // Worker concurrency slots
  const poolSize = capacity.poolSize || 2;
  const idleWorkers = capacity.idleWorkers || 0;
  workersBadge.textContent = `${idleWorkers} / ${poolSize} Livres`;

  let slotsHtml = '';
  for (let i = 1; i <= poolSize; i++) {
    const isBusy = (i > idleWorkers);
    slotsHtml += `
      <div class="worker-slot ${isBusy ? 'busy' : 'idle'}">
        <span class="slot-dot"></span>
        <span class="slot-name">Worker ${i}</span>
        <span class="slot-status">${isBusy ? 'Processando' : 'Ocioso (Pronto)'}</span>
      </div>
    `;
  }
  workersSlotsContainer.innerHTML = slotsHtml;

  // 2. Metrics Grid
  metricTotalRequests.textContent = formatNumber(usage.totalRequests || 0);
  metricTodaySub.textContent = `${formatNumber(usage.requestsToday || 0)} processadas hoje`;

  const tokens = usage.tokens || {};
  metricTotalTokens.textContent = formatNumber(tokens.totalTokens || 0);
  metricTokensSub.textContent = `${formatNumber(tokens.promptTokens || 0)} entrada • ${formatNumber(tokens.completionTokens || 0)} saída`;

  metricAvgLatency.textContent = usage.avgLatencyMs ? `${usage.avgLatencyMs} ms` : '-- ms';
  metricSuccessRate.textContent = `${usage.successRate || 100}%`;
  metricUptimeSub.textContent = `Uptime: ${formatUptime(uptimeSeconds)}`;

  // 3. Model Usage Breakdown
  const modelUsage = usage.modelUsage || {};
  const modelKeys = Object.keys(modelUsage);
  modelsActiveCounter.textContent = `${modelKeys.length} Modelos Usados`;

  if (modelKeys.length === 0) {
    modelBarsContainer.innerHTML = `
      <div class="empty-usage-state">
        <div class="empty-icon">📊</div>
        <p>Nenhuma requisição recebida ainda hoje.</p>
        <span>Faça uma chamada ou use o console de teste acima para visualizar o consumo.</span>
      </div>
    `;
  } else {
    let maxRequests = 1;
    modelKeys.forEach(k => {
      if (modelUsage[k].requests > maxRequests) maxRequests = modelUsage[k].requests;
    });

    let barsHtml = '';
    modelKeys.forEach(k => {
      const item = modelUsage[k];
      const percent = Math.min(100, Math.round((item.requests / maxRequests) * 100));
      const avgLat = item.requests > 0 ? Math.round(item.totalDurationMs / item.requests) : 0;

      barsHtml += `
        <div class="model-usage-row">
          <div class="model-row-header">
            <span class="model-row-name">${k}</span>
            <span class="model-row-count">${formatNumber(item.requests)} reqs</span>
          </div>
          <div class="model-bar-track">
            <div class="model-bar-thumb" style="width: ${percent}%;"></div>
          </div>
          <div class="model-row-footer">
            <span>Tokens: ${formatNumber(item.tokens)}</span>
            <span>Média: ${avgLat}ms</span>
          </div>
        </div>
      `;
    });
    modelBarsContainer.innerHTML = barsHtml;
  }

  // 4. Live API Feed
  feedCountBadge.textContent = `${recentLogs.length} chamadas registradas`;
  if (recentLogs.length === 0) {
    liveFeedTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">
          <div class="empty-feed">
            <span>Aguardando chamadas da API na porta 3000...</span>
          </div>
        </td>
      </tr>
    `;
  } else {
    let rowsHtml = '';
    recentLogs.forEach(log => {
      const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--';
      const isSuccess = log.status >= 200 && log.status < 400;
      const statusClass = isSuccess ? 'badge-200' : 'badge-error';
      const statusText = log.status || (isSuccess ? '200 OK' : '500 ERR');
      const durSec = log.durationMs ? `${(log.durationMs / 1000).toFixed(2)}s` : '--';
      const tokStr = log.totalTokens ? `${formatNumber(log.totalTokens)} tok` : '--';

      rowsHtml += `
        <tr>
          <td><code>${timeStr}</code></td>
          <td><code>${log.endpoint || '/v1/chat/completions'}</code></td>
          <td><strong style="color: #FFA726;">${log.model || 'mistral-small-2603'}</strong></td>
          <td><span class="badge-status ${statusClass}">${statusText}</span></td>
          <td><code>${durSec}</code></td>
          <td><code>${tokStr}</code></td>
        </tr>
      `;
    });
    liveFeedTbody.innerHTML = rowsHtml;
  }
}

// Local 1-second timer ticker for the countdown
setInterval(() => {
  if (localResetSeconds > 0) {
    localResetSeconds--;
    resetTimerVal.textContent = formatCountdown(localResetSeconds);
  }
}, 1000);

// Clickable model tags in the list
document.querySelectorAll('.clickable-model').forEach(el => {
  el.addEventListener('click', async () => {
    const id = el.dataset.model || el.textContent.trim();
    setSelectedModel(id, false);
    try {
      await navigator.clipboard.writeText(id);
      showToast(`Modelo selecionado e copiado: ${id}`);
    } catch (e) {
      showToast(id);
    }
  });
});

// Initialize
setSelectedModel('mistral-small-2603', false);
fetchStats();
setInterval(fetchStats, 3000);
