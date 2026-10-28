#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação Automatizada DuckAI no Servidor
# ==============================================================================

set -e

echo -e "\n🦆 ====================================================="
echo -e "🦆   DuckAI - Implantação em Container Docker"
echo -e "🦆 =====================================================\n"

# Verifica se o Docker está instalado
if ! command -v docker &> /dev/null; then
  echo -e "❌ Erro: O Docker não foi encontrado no sistema."
  echo -e "   Instale o Docker antes de continuar: https://docs.docker.com/engine/install/"
  exit 1
fi

# Verifica se o Docker Compose está disponível
if ! docker compose version &> /dev/null; then
  echo -e "❌ Erro: O plugin 'docker compose' não foi encontrado."
  echo -e "   Instale o Docker Compose v2: https://docs.docker.com/compose/install/"
  exit 1
fi

# Garante a existência do arquivo de variáveis de ambiente
if [ ! -f .env ]; then
  if [ -f .env.docker ]; then
    echo -e "📄 Criando arquivo .env a partir de .env.docker..."
    cp .env.docker .env
  elif [ -f .env.example ]; then
    echo -e "📄 Criando arquivo .env a partir de .env.example..."
    cp .env.example .env
  fi
fi

# Cria pasta de dados persistentes com permissões adequadas
mkdir -p ./data
chmod 777 ./data 2>/dev/null || true

echo -e "🔨 Construindo imagem e iniciando container..."
docker compose up -d --build

echo -e "\n✅ Container DuckAI iniciado com sucesso!"
echo -e "📡 Verificando status dos containers:"
docker compose ps

echo -e "\n📊 Para acompanhar os logs em tempo real:"
echo -e "   docker compose logs -f\n"
echo -e "🌐 Acesse no navegador:"
echo -e "   http://localhost:3000 (ou o IP do seu servidor)\n"
