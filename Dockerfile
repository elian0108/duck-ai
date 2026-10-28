# ==============================================================================
# DuckAI API Gateway - Production Dockerfile
# Suporte multiplataforma (amd64 / arm64) com Google Chrome / Chromium Headless
# ==============================================================================

FROM node:20-bookworm-slim

# Evita prompts interativos durante a instalação do apt
ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HEADLESS=true

# Instalação de dependências do sistema, fontes e Google Chrome / Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    procps \
    dumb-init \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    && dpkgArch="$(dpkg --print-architecture)" \
    && if [ "$dpkgArch" = "amd64" ]; then \
         curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
         && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
         && apt-get update \
         && apt-get install -y --no-install-recommends google-chrome-stable; \
       else \
         apt-get update \
         && apt-get install -y --no-install-recommends chromium; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# Diretório de trabalho da aplicação
WORKDIR /app

# Instalação de dependências do Node.js com cache otimizado
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código da aplicação
COPY . .

# Cria o diretório de dados persistentes e ajusta permissões para o usuário node
RUN mkdir -p /app/data && chown -R node:node /app

# Execução segura com usuário não-root
USER node

# Porta padrão do gateway HTTP
EXPOSE 3000

# Verificação de saúde embutida (Healthcheck nativo com Node.js fetch)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# dumb-init gerencia sinais do SO (SIGTERM, SIGINT) e previne processos zumbis do Chrome
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Inicialização do servidor
CMD ["npm", "start"]
