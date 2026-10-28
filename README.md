# 🦆 DuckAI - API Gateway & Catálogo de Modelos Oficiais

Um gateway HTTP de alta performance compatível com a API OpenAI e Anthropic, operando sobre o motor Duck.ai. Conta com suporte completo a **Streaming SSE**, **modelos oficiais do Duck.ai** (`gpt-6-luna`, `claude-haiku-4-5`, `mistral-small-2603`, `gpt-5.4-mini`, `tinfoil/gpt-oss-120b`, `tinfoil/gemma4-31b`) e um **Painel Executivo de Telemetria & Console Interativo** com monitoramento de capacidade restante em tempo real.

---

## 🤖 Modelos Oficiais Apresentados no DuckAI

O gateway apresenta exclusivamente os 6 modelos nativos fornecidos pelo Duck.ai:

| Modelo ID | Nome do Modelo | Provedor Oficial | Especialidade & Capacidades |
| :--- | :--- | :--- | :--- |
| `mistral-small-2603` | **Mistral Small 4** | Mistral AI | ⭐ Recomendado / Chamadas de Ferramentas (Tools) e Código |
| `gpt-6-luna` | **GPT-6 Luna** | OpenAI | Flagship multiuso: raciocínio ágil, alta precisão e versatilidade |
| `claude-haiku-4-5` | **Claude Haiku 4.5** | Anthropic | Excelente para síntese analítica, redação fluida e refatoração |
| `gpt-5.4-mini` | **GPT-5.4 mini** | OpenAI | Respostas ultrarrápidas para tarefas curtas e baixa latência |
| `tinfoil/gpt-oss-120b` | **gpt-oss 120B** | OpenAI / Tinfoil | 120B parâmetros open-source executados em enclave seguro |
| `tinfoil/gemma4-31b` | **Gemma 4 31B Beta** | Google / Tinfoil | Modelo aberto de última geração do Google DeepMind (31B) |

---

## ⚡ Como Conectar e Utilizar

### 1. Chamada via cURL
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-small-2603",
    "messages": [{"role": "user", "content": "Olá Duck.ai!"}],
    "stream": true
  }'
```

### 2. Python (SDK OpenAI Oficial)
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3000/v1", api_key="none")

stream = client.chat.completions.create(
    model="gpt-6-luna", # ou claude-haiku-4-5, mistral-small-2603
    messages=[{"role": "user", "content": "Explique computação quântica em 2 frases."}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 3. Configuração via `settings.yaml` (DeepSeek Harness / dsh)
```yaml
llm-pi-ai:
  providers:
    duckai:
      api: openai-completions
      baseURL: http://localhost:3000/v1
      apiKey: none
      models:
        - id: mistral-small-2603
        - id: gpt-6-luna
        - id: claude-haiku-4-5
        - id: gpt-5.4-mini
        - id: tinfoil/gpt-oss-120b
        - id: tinfoil/gemma4-31b
```

---

## 📊 Painel de Uso & Capacidade Restante

Ao acessar [http://localhost:3000](http://localhost:3000), o painel executivo exibe:

1. **Quanto Pode Ser Usado Ainda (Capacidade & Cotas)**:
   - Cota Diária Estimada e Requisições Restantes (ex: 150 req/dia com medidor visual).
   - Percentual de capacidade operacional disponível.
   - Detecção em tempo real de status do Duck.ai (Normal vs Cooldown).
   - Concorrência instantânea: slots de workers livres no pool (ex: 2/2 prontos).
   - Contador regressivo para o reset da cota diária (meia-noite).

2. **Métricas de Consumo do Servidor**:
   - Total de requisições processadas (histórico e hoje).
   - Contagem e estimativa de tokens (entrada, saída e total).
   - Latência média de resposta e velocidade.
   - Taxa de sucesso operacional (%).
   - Distribuição de uso detalhada por modelo.

3. **Feed em Tempo Real da API**:
   - Histórico das últimas chamadas recebidas com endpoint, modelo, status HTTP, duração e tokens consumidos.

---

## 🐳 Executando com Docker (Recomendado para Servidores)

O projeto inclui configuração completa e otimizada para containers Docker, incluindo o **Google Chrome headless**, dependências gráficas, fontes CJK/Emoji e gerenciamento de processos zumbis via `dumb-init`.

### 1. Inicialização Rápida com Docker Compose

No servidor, clone o repositório e execute:

```bash
# 1. Copie o template de variáveis de ambiente para produção
cp .env.docker .env

# 2. Inicie o container em segundo plano (em background)
docker compose up -d --build
```

Ou execute o script automatizado de implantação:
```bash
chmod +x deploy.sh
./deploy.sh
```

### 2. Comandos Úteis do Docker

```bash
# Ver status do container e saúde (health check)
docker compose ps

# Ver logs em tempo real
docker compose logs -f

# Parar o serviço
docker compose down

# Reiniciar o serviço
docker compose restart
```

### 3. Vantagens da Configuração Docker DuckAI
- **Memória Compartilhada Otimizada (`shm_size: 2gb`)**: Evita o erro comum de abas do Chrome travando por falta de `/dev/shm`.
- **Persistência de Dados (`./data:/app/data`)**: As métricas de uso diário, tokens e cotas persistem mesmo após recriações do container.
- **Suporte Multi-arquitetura (amd64 / arm64)**: Funciona tanto em VPS x86 (Intel/AMD) quanto ARM (AWS Graviton, Oracle ARM, Apple Silicon).
- **Processos Limpos (`dumb-init`)**: Evita acúmulo de processos órfãos do Chrome.
- **Health Check Nativo**: Monitora a disponibilidade em `http://localhost:3000/health`.

---

## 🚀 Instalação & Inicialização Local (Sem Docker)

### Pré-requisitos
- **Node.js** v18+ (recomendado Node 20+)
- **Google Chrome** instalado no sistema.

### 1. Iniciar o Servidor
```bash
npm start
```
Ou em modo de desenvolvimento com recarregamento automático:
```bash
npm run dev
```

### 2. Endpoints Disponíveis
- 📊 **Painel de Uso & Capacidade**: `http://localhost:3000`
- 📡 **OpenAI Chat API**: `http://localhost:3000/v1/chat/completions` (e `/chat/completions`)
- 🤖 **Anthropic Messages API**: `http://localhost:3000/v1/messages`
- 📋 **Listagem de Modelos**: `http://localhost:3000/v1/models` (e `/models`)
- 📈 **Métricas de Uso JSON**: `http://localhost:3000/api/usage`
- ❤️ **Health Check**: `http://localhost:3000/health`

---

## 🌐 Configuração de Proxy Reverso (Nginx / Domínio com SSL)

Caso queira expor o DuckAI sob seu domínio no servidor com HTTPS:

```nginx
server {
    listen 80;
    server_name duckai.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name duckai.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/duckai.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/duckai.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Suporte a Streaming SSE (Server-Sent Events) sem buffer
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts longos para requisições de IA
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

---

## 🧪 Suíte de Testes Automatizados

Para validar o funcionamento da API e a compatibilidade com o DeepSeek Harness:

```bash
npm test
```

A suíte verifica:
1. Health check e prontidão para DeepSeek Harness.
2. Endpoint de cota e capacidade restante (`/api/usage`).
3. Mapeamento dos modelos `deepseek-chat`, `deepseek-reasoner` e `deepseek-coder`.
4. Resposta e preservação do modelo em `chat/completions`.

