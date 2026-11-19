#!/bin/sh
# Glass TV — empacotamento e instalação com as ferramentas OFICIAIS da Samsung
# (Tizen Studio CLI: `tizen` e `sdb`). Veja docs/04-instalacao-na-tv.md.
#
#   sh tools/tizen.sh check       verifica CLI, certificado e config.xml (não toca na TV)
#   sh tools/tizen.sh package     gera dist/GlassTV.wgt assinado (não toca na TV)
#   sh tools/tizen.sh connect     conecta à TV (sdb)              ┐
#   sh tools/tizen.sh install     instala dist/GlassTV.wgt        │ pedem confirmação
#   sh tools/tizen.sh run         abre o app na TV                │ e acessam/alteram
#   sh tools/tizen.sh uninstall   remove o app da TV              ┘ a TV
#
# Tudo que é específico do aparelho vem do arquivo .env na raiz (ignorado pelo
# git; modelo em .env.example). Certificados nunca ficam dentro do repositório.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR="$ROOT/app"
BUILD_DIR="$ROOT/build/web"
DIST="$ROOT/dist"
ENV_FILE="$ROOT/.env"
APP_ID="GlassTV001.GlassTV"

die() { echo "Erro: $*" >&2; exit 1; }

# Lê somente as chaves conhecidas do .env, sem executá-lo como script.
load_env() {
  [ -f "$ENV_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in TV_IP|TV_PORT|TIZEN_HOME|TIZEN_DATA|CERT_PROFILE|CERT_DIR) ;; *) continue ;; esac
    val=$(printf '%s' "$val" | sed -e 's/[[:space:]]#.*$//' -e 's/[[:space:]]*$//' \
      -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" \
      -e "s|^~|$HOME|" -e "s|\${HOME}|$HOME|g" -e "s|\$HOME|$HOME|g")
    eval "$key=\$val"
  done < "$ENV_FILE"
}

TV_IP=; TV_PORT=; TIZEN_HOME=; TIZEN_DATA=; CERT_PROFILE=; CERT_DIR=
load_env
TV_PORT=${TV_PORT:-26101}
TIZEN_HOME=${TIZEN_HOME:-"$HOME/tizen-studio"}
TIZEN_DATA=${TIZEN_DATA:-"$HOME/tizen-studio-data"}
PATH="$TIZEN_HOME/tools/ide/bin:$TIZEN_HOME/tools:$PATH"

need_cli() {
  command -v tizen >/dev/null 2>&1 || die "CLI 'tizen' não encontrada. Instale o Tizen Studio (docs/04-instalacao-na-tv.md) ou ajuste TIZEN_HOME no .env."
  command -v sdb >/dev/null 2>&1 || die "'sdb' não encontrado em \$TIZEN_HOME/tools."
}

need_profile() {
  [ -n "$CERT_PROFILE" ] || die "Defina CERT_PROFILE no .env (perfil de certificado Samsung)."
}

need_tv() {
  [ -f "$ENV_FILE" ] || die "Crie o .env a partir do .env.example."
  [ -n "$TV_IP" ] || die "Defina TV_IP no .env."
  [ "$TV_IP" != "192.0.2.10" ] || die "TV_IP ainda é o valor de exemplo; use o IP da sua TV."
  TARGET="$TV_IP:$TV_PORT"
}

# Certificados e perfis de assinatura nunca podem estar dentro do repositório.
guard_certificates() {
  found=$(find "$ROOT" -path "$ROOT/.git" -prune -o \( -name '*.p12' -o -name '*.pfx' -o -name 'profiles.xml' \) -print | head -n 5)
  [ -z "$found" ] || die "Arquivos de certificado dentro do repositório (mova para fora):
$found"
  if [ -n "$CERT_DIR" ]; then
    case "$CERT_DIR/" in "$ROOT"/*) die "CERT_DIR aponta para dentro do repositório. Use uma pasta fora dele." ;; esac
    [ -d "$CERT_DIR" ] || die "CERT_DIR não existe (confira o .env)."
  fi
}

confirm() {
  printf '\n%s\nConfirmar? [s/N] ' "$1"
  read -r answer
  case "$answer" in s|S|sim|SIM) ;; *) echo "Cancelado."; exit 1 ;; esac
}

cmd_check() {
  guard_certificates
  need_cli
  need_profile
  echo "• tizen: $(command -v tizen)"
  echo "• sdb:   $(command -v sdb)"
  echo "• Perfil de certificado: $CERT_PROFILE"
  [ -f "$TIZEN_DATA/profile/profiles.xml" ] || echo "  (aviso: $TIZEN_DATA/profile/profiles.xml não encontrado — o perfil foi criado no Certificate Manager?)"
  [ -n "$CERT_DIR" ] && echo "• Certificados em: $CERT_DIR (fora do repositório)"
  echo "• App ID: $APP_ID"
  echo "• Privilégios declarados:"
  grep -o 'privilege name="[^"]*"' "$APP_DIR/config.xml" | sed 's/privilege name=/    /'
  if grep -q 'privilege/internet' "$APP_DIR/config.xml"; then die "config.xml não deveria pedir acesso à internet."; fi
  echo "OK."
}

cmd_package() {
  guard_certificates
  need_cli
  need_profile
  # Copia o app para build/ (ignorado) para não gerar arquivos de assinatura em app/.
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR" "$DIST"
  cp -R "$APP_DIR/." "$BUILD_DIR/"
  tizen build-web -e ".*" -e "*.md" -- "$BUILD_DIR"
  tizen package -t wgt -s "$CERT_PROFILE" -- "$BUILD_DIR/.buildResult"
  WGT=$(ls -t "$BUILD_DIR/.buildResult"/*.wgt | head -n 1)
  cp "$WGT" "$DIST/GlassTV.wgt"
  echo "Pacote: dist/GlassTV.wgt"
}

cmd_connect() {
  need_cli; need_tv
  confirm "Conectar ao modo desenvolvedor da TV em $TARGET (sdb connect)."
  sdb connect "$TARGET"
  sdb devices
}

cmd_install() {
  need_cli; need_tv
  [ -f "$DIST/GlassTV.wgt" ] || die "Gere o pacote antes: sh tools/tizen.sh package"
  confirm "INSTALAR a Glass TV na TV $TARGET (pode ser removida depois pela lista de apps ou com 'uninstall')."
  tizen install -s "$TARGET" -n GlassTV.wgt -- "$DIST"
}

cmd_run() {
  need_cli; need_tv
  confirm "Abrir a Glass TV na TV $TARGET."
  tizen run -s "$TARGET" -p "$APP_ID"
}

cmd_uninstall() {
  need_cli; need_tv
  confirm "REMOVER a Glass TV da TV $TARGET (as preferências salvas no app serão apagadas)."
  tizen uninstall -s "$TARGET" -p "$APP_ID"
}

case "${1:-}" in
  check) cmd_check ;;
  package) cmd_package ;;
  connect) cmd_connect ;;
  install) cmd_install ;;
  run) cmd_run ;;
  uninstall) cmd_uninstall ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
