#!/usr/bin/env bash
# =============================================================================
# sync-deploy.sh  —  Sincroniza código local → VPS e reconstrói containers
# =============================================================================
# Pré-requisitos no Windows:
#   • Git Bash (vem com Git for Windows) ou WSL
#   • rsync instalado no Git Bash:
#       pacman -S rsync          (MSYS2/Git Bash)
#       ou: winget install rsync
#   • Chave SSH configurada para a VPS (sem senha) ou use ssh-agent
#
# Uso:
#   ./sync-deploy.sh            — sincroniza tudo e reconstrói
#   ./sync-deploy.sh --dry-run  — mostra o que seria enviado, sem enviar
#   ./sync-deploy.sh --only-sync — sincroniza sem reconstruir containers
# =============================================================================

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO  ← edite apenas aqui
# ──────────────────────────────────────────────────────────────────────────────
VPS_USER="ubuntu"
VPS_HOST="IP_OU_DOMINIO_DA_VPS"   # ex: 203.0.113.42 ou meusite.com.br
VPS_PATH="/opt/whaticket"          # pasta do projeto na VPS
COMPOSE_FILE="docker-compose.prod.yml"
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DRY_RUN=false
ONLY_SYNC=false

for arg in "$@"; do
  case $arg in
    --dry-run)   DRY_RUN=true ;;
    --only-sync) ONLY_SYNC=true ;;
    *) echo "Opção desconhecida: $arg"; exit 1 ;;
  esac
done

# Valida configuração
if [[ "$VPS_HOST" == "IP_OU_DOMINIO_DA_VPS" ]]; then
  echo "❌  Configure VPS_HOST no início do script antes de usar."
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  WhaTicket — Sincronização + Deploy"
echo "  Destino: ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
echo "══════════════════════════════════════════════════════════"
echo ""

# ── 1. rsync: envia apenas os arquivos de código fonte ──────────────────────
RSYNC_ARGS=(
  -avz                    # archive + verbose + compress
  --progress
  --delete                # remove arquivos na VPS que foram deletados localmente
  --exclude='.git/'
  --exclude='node_modules/'
  --exclude='.docker/'    # dados do banco de dados
  --exclude='backend/public/'   # uploads dos usuários na VPS (não sobrescrever)
  --exclude='ssl/'        # certificados TLS na VPS
  --exclude='*.log'
  --exclude='.env'        # .env fica APENAS na VPS — nunca sobrescrever
)

if $DRY_RUN; then
  RSYNC_ARGS+=(--dry-run)
  echo "⚠️  MODO DRY-RUN — nenhum arquivo será enviado"
  echo ""
fi

echo "📁  Sincronizando arquivos..."
rsync "${RSYNC_ARGS[@]}" ./ "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

echo ""
echo "✅  Sincronização concluída."

if $DRY_RUN || $ONLY_SYNC; then
  echo ""
  [[ $DRY_RUN == true ]] && echo "ℹ️  Dry-run: nenhuma ação na VPS."
  [[ $ONLY_SYNC == true ]] && echo "ℹ️  --only-sync: containers não foram reconstruídos."
  exit 0
fi

# ── 2. SSH: reconstrói apenas os containers alterados ───────────────────────
echo ""
echo "🔨  Reconstruindo containers na VPS..."
echo ""

# shellcheck disable=SC2029
ssh "${VPS_USER}@${VPS_HOST}" "
  set -e
  cd '${VPS_PATH}'
  echo '→ Parando frontend e backend (mantém banco de dados)...'
  sudo docker-compose -f '${COMPOSE_FILE}' stop backend frontend
  echo '→ Reconstruindo imagens...'
  sudo docker-compose -f '${COMPOSE_FILE}' build backend frontend
  echo '→ Subindo containers...'
  sudo docker-compose -f '${COMPOSE_FILE}' up -d backend frontend
  echo '→ Aguardando backend iniciar...'
  sleep 5
  sudo docker-compose -f '${COMPOSE_FILE}' ps
"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅  Deploy concluído!"
echo ""
echo "  Frontend : https://chat.cloudconnectivity.com.br"
echo "  Backend  : https://api.cloudconnectivity.com.br"
echo ""
echo "  Logs em tempo real:"
echo "    ssh ${VPS_USER}@${VPS_HOST} 'sudo docker-compose -f ${VPS_PATH}/${COMPOSE_FILE} logs -f backend'"
echo "══════════════════════════════════════════════════════════"
echo ""
