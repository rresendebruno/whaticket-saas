#!/bin/bash
# =============================================================================
# WhaTicket Community - Script de deploy na VPS
# =============================================================================
# Execute como root ou com sudo na VPS Ubuntu 20.04.
# Pré-requisito: Docker, Docker Compose e Traefik já instalados.
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
# =============================================================================

set -e

# ---------- Verificações iniciais ----------
if [ ! -f ".env" ]; then
  echo "[ERRO] Arquivo .env não encontrado."
  echo "       Copie .env.production.example para .env e preencha os valores."
  exit 1
fi

# Carrega variáveis do .env para validação básica
set -a; source .env; set +a

for VAR in MYSQL_ROOT_PASSWORD JWT_SECRET JWT_REFRESH_SECRET ZAPI_INSTANCE_ID ZAPI_TOKEN; do
  if [ -z "${!VAR}" ] || echo "${!VAR}" | grep -q "TROQUE\|GERE\|COLE"; then
    echo "[ERRO] Variável $VAR ainda tem valor placeholder. Edite o .env antes de continuar."
    exit 1
  fi
done

# ---------- Detectar nome da rede do Traefik ----------
# Verifica redes comuns usadas pelo Traefik
TRAEFIK_NETWORK=""
for NET in proxy traefik traefik_public traefik-public; do
  if docker network ls --format '{{.Name}}' | grep -qx "$NET"; then
    TRAEFIK_NETWORK="$NET"
    break
  fi
done

if [ -z "$TRAEFIK_NETWORK" ]; then
  echo "[ERRO] Nenhuma rede do Traefik encontrada (proxy, traefik, traefik_public, traefik-public)."
  echo "       Crie a rede antes de continuar: docker network create proxy"
  exit 1
fi

echo "[INFO] Rede do Traefik detectada: $TRAEFIK_NETWORK"

# Substitui o nome da rede no compose se necessário
if [ "$TRAEFIK_NETWORK" != "proxy" ]; then
  echo "[INFO] Ajustando docker-compose.prod.yml para usar a rede '$TRAEFIK_NETWORK'..."
  sed -i "s/proxy:/  $TRAEFIK_NETWORK:/g; s/traefik.docker.network=proxy/traefik.docker.network=$TRAEFIK_NETWORK/g" docker-compose.prod.yml
fi

# ---------- Cria diretórios necessários ----------
mkdir -p .docker/data
mkdir -p ssl/certs
mkdir -p ssl/www
mkdir -p backend/public

# ---------- Build e subida dos containers ----------
echo "[INFO] Construindo imagens e subindo containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "============================================================"
echo " Deploy concluído!"
echo ""
echo " Frontend : https://chat.cloudconnectivity.com.br"
echo " Backend  : https://api.cloudconnectivity.com.br"
echo ""
echo " Acompanhe os logs:"
echo "   docker compose -f docker-compose.prod.yml logs -f"
echo "============================================================"
