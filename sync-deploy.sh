#!/usr/bin/env bash
# Sincroniza codigo local -> VPS via scp+SSH
# Uso:
#   bash sync-deploy.sh            -- sincroniza e reconstroi containers
#   bash sync-deploy.sh --dry-run  -- lista arquivos sem enviar
#   bash sync-deploy.sh --only-sync -- sincroniza sem reconstruir

VPS_USER="ubuntu"
VPS_HOST="187.84.150.219"
VPS_PATH="/opt/whaticket"
COMPOSE_FILE="docker-compose.prod.yml"

SSH_OPTS="-o ServerAliveInterval=60 -o ServerAliveCountMax=10 -o ConnectTimeout=30"

set -euo pipefail

DRY_RUN=false
ONLY_SYNC=false

for arg in "$@"; do
  case $arg in
    --dry-run)   DRY_RUN=true ;;
    --only-sync) ONLY_SYNC=true ;;
    *) echo "Opcao desconhecida: $arg"; exit 1 ;;
  esac
done

echo ""
echo "======================================================"
echo "  WhaTicket -- Sincronizacao + Deploy"
echo "  Destino: ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
echo "======================================================"
echo ""

TAR_EXCLUDES=(
  --exclude="./.git"
  --exclude="./.claude"
  --exclude="node_modules"
  --exclude="whaticket-deploy-*.tar.gz"
  --exclude="./.docker"
  --exclude="./backend/public"
  --exclude="./backend/.env"
  --exclude="./backend/.wwebjs_auth"
  --exclude="./ssl"
  --exclude="./.env"
  --exclude="./*.log"
  --exclude="./backend/**/*.log"
)

if $DRY_RUN; then
  echo "MODO DRY-RUN -- nenhum arquivo sera enviado"
  echo ""
  echo "Arquivos que seriam transferidos:"
  echo "--------------------------------------"
  tar "${TAR_EXCLUDES[@]}" -cvf /dev/null . 2>&1 | grep -v "^tar:" | head -100
  echo "--------------------------------------"
  echo "Dry-run concluido. Para enviar, rode sem --dry-run."
  exit 0
fi

# Gera tar localmente (mais confiavel que pipe direto).
# O arquivo PRECISA ficar fora da pasta empacotada; senao o tar le o proprio
# arquivo enquanto ele cresce e falha com "file changed as we read it".
TMPFILE="$(mktemp -t whaticket-deploy-XXXXXX).tar.gz"
trap 'rm -f "$TMPFILE"' EXIT
rm -f whaticket-deploy-tmp.tar.gz  # sobra de execucoes antigas
echo "Empacotando arquivos localmente..."
tar "${TAR_EXCLUDES[@]}" -czf "$TMPFILE" .
SIZE=$(du -sh "$TMPFILE" | cut -f1)
echo "Arquivo gerado: ${SIZE}"
echo ""

echo "Transferindo para a VPS via SCP..."
scp $SSH_OPTS "$TMPFILE" "${VPS_USER}@${VPS_HOST}:/tmp/whaticket-deploy.tar.gz"
rm -f "$TMPFILE"
echo "Transferencia concluida."
echo ""

echo "Extraindo na VPS..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "
  # NAO mexer no dono de .docker (dados do MariaDB, dono = usuario mysql do
  # container) nem de ssl; trocar o dono deles quebra o banco (errno 13).
  sudo find '${VPS_PATH}' \\( -path '${VPS_PATH}/.docker' -o -path '${VPS_PATH}/ssl' \\) -prune \
    -o -exec chown ${VPS_USER}:${VPS_USER} {} + 2>/dev/null || true
  cd '${VPS_PATH}'
  tar xzf /tmp/whaticket-deploy.tar.gz --overwrite --no-same-owner --no-same-permissions
  rm -f /tmp/whaticket-deploy.tar.gz
  echo 'Extracao concluida.'
"
echo "Sincronizacao concluida."

if $ONLY_SYNC; then
  exit 0
fi

echo ""
echo "Reconstruindo containers na VPS..."
echo "(Pode levar varios minutos)"
echo ""

ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "
  # pipefail: without it, 'build | tee' hides a failed build and the script
  # printed 'Deploy concluido!' even when nothing was deployed.
  set -eo pipefail
  cd '${VPS_PATH}'
  # Builda com os containers antigos ainda no ar; o 'up -d' abaixo troca
  # pelos novos so no final, deixando o sistema fora do ar so por segundos.
  echo 'Buildando (log em /tmp/docker-build.log)...'
  sudo docker-compose -f '${COMPOSE_FILE}' build backend frontend 2>&1 | tee /tmp/docker-build.log
  echo 'Subindo containers...'
  sudo docker-compose -f '${COMPOSE_FILE}' up -d backend frontend
  sudo docker-compose -f '${COMPOSE_FILE}' ps
"

echo ""
echo "======================================================"
echo "  Deploy concluido!"
echo "  Frontend : https://chat.cloudconnectivity.com.br"
echo "  Backend  : https://api.cloudconnectivity.com.br"
echo "======================================================"
echo ""
