#!/bin/sh
# Glass TV — empacotamento e instalação com as ferramentas OFICIAIS da Samsung
# (Tizen Studio CLI: `tizen` e `sdb`). Veja docs/04-instalacao-na-tv.md.
#
#   sh tools/tizen.sh check        verifica CLI, certificado e config.xml (não toca na TV)
#   sh tools/tizen.sh package      gera dist/GlassTV.wgt assinado (não toca na TV)
#   sh tools/tizen.sh connect      conecta e mantém aberto (certif.) ┐
#   sh tools/tizen.sh install      instala dist/GlassTV.wgt          │ pedem confirmação
#   sh tools/tizen.sh run          abre o app na TV                  │ e acessam/alteram
#   sh tools/tizen.sh uninstall    remove o app da TV                ┘ a TV
#   sh tools/tizen.sh disconnect   desconecta e encerra o servidor do sdb
#
# SDK: usa o Tizen SDK instalado pela extensão "Tizen Extension" do VS Code
# (~/.tizen-extension-platform/server/sdktools) ou, se não existir, o Tizen Studio
# (~/tizen-studio). Pode ser forçado com TIZEN_HOME/TIZEN_DATA no .env.
#
# O servidor do sdb escuta em todas as interfaces de rede enquanto roda; por
# isso install/run/uninstall o encerram ao terminar (connect deixa aberto até
# você rodar disconnect).
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
VSCODE_SDK="$HOME/.tizen-extension-platform/server/sdktools/data"
if [ -z "$TIZEN_HOME" ]; then
  if [ -x "$VSCODE_SDK/tools/ide/bin/tizen" ]; then TIZEN_HOME="$VSCODE_SDK"; else TIZEN_HOME="$HOME/tizen-studio"; fi
fi
if [ -z "$TIZEN_DATA" ]; then
  # sdk.info informa a pasta de dados (perfis de certificado) do SDK instalado.
  TIZEN_DATA=$(sed -n 's/^TIZEN_SDK_DATA_PATH=//p' "$TIZEN_HOME/sdk.info" 2>/dev/null)
  TIZEN_DATA=${TIZEN_DATA:-"$HOME/tizen-studio-data"}
fi
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
  echo "• SDK:   $(printf '%s' "$TIZEN_HOME" | sed "s|^$HOME|~|")"
  echo "• tizen: $(tizen version 2>/dev/null | head -n 1)"
  echo "• sdb:   $(sdb version 2>/dev/null | head -n 1)"
  echo "• Perfil de certificado: $CERT_PROFILE"
  [ -f "$TIZEN_DATA/profile/profiles.xml" ] || echo "  (aviso: $TIZEN_DATA/profile/profiles.xml não encontrado — o perfil foi criado no Certificate Manager?)"
  [ -n "$CERT_DIR" ] && echo "• Certificados em: $CERT_DIR (fora do repositório)"
  echo "• App ID: $APP_ID"
  echo "• Privilégios declarados:"
  grep -o 'privilege name="[^"]*"' "$APP_DIR/config.xml" | sed 's/privilege name=/    /'
  if grep -q '<tizen:privilege name="http://tizen.org/privilege/internet"' "$APP_DIR/config.xml"; then die "config.xml não deveria pedir acesso à internet."; fi
  echo "OK."
}

cmd_package() {
  guard_certificates
  need_cli
  need_profile
  # Copia o app para build/ (ignorado), sem arquivos ocultos nem .md, para não gerar
  # arquivos de assinatura em app/. Equivale ao `tizen build-web -e ".*" -e "*.md"`,
  # que não está disponível na CLI instalada pela extensão do VS Code (falta o
  # módulo web); a assinatura abaixo é feita pela própria CLI oficial.
  OUT="$BUILD_DIR/.buildResult"
  rm -rf "$BUILD_DIR"
  mkdir -p "$OUT" "$DIST"
  rsync -a --exclude='.*' --exclude='*.md' "$APP_DIR/" "$OUT/"
  tizen package -t wgt -s "$CERT_PROFILE" -- "$OUT"
  WGT=$(find "$OUT" -maxdepth 1 -name '*.wgt' -print | head -n 1)
  [ -n "$WGT" ] || die "O pacote .wgt não foi gerado."
  cp "$WGT" "$DIST/GlassTV.wgt"
  echo "Pacote: dist/GlassTV.wgt ($(du -h "$DIST/GlassTV.wgt" | cut -f1))"
}

# Conecta à TV e garante que o servidor do sdb seja encerrado ao final.
tv_session_start() {
  [ "${1:-}" = "keep" ] || trap 'tv_session_end' EXIT INT TERM
  sdb connect "$TARGET" >/dev/null
  sdb devices | grep -q "^$TARGET" || die "A TV não respondeu em $TARGET (modo desenvolvedor ligado e IP do Mac configurado nela?)."
}

tv_session_end() {
  sdb disconnect "$TARGET" >/dev/null 2>&1 || true
  sdb kill-server >/dev/null 2>&1 || true
}

cmd_connect() {
  need_cli; need_tv
  confirm "Conectar à TV em $TARGET e DEIXAR a conexão aberta (ex.: para criar o certificado). Depois rode: sh tools/tizen.sh disconnect"
  tv_session_start keep
  sdb devices
  echo "Conexão aberta. Ao terminar: sh tools/tizen.sh disconnect"
}

cmd_install() {
  need_cli; need_tv
  [ -f "$DIST/GlassTV.wgt" ] || die "Gere o pacote antes: sh tools/tizen.sh package"
  confirm "INSTALAR a Glass TV na TV $TARGET (pode ser removida depois pela lista de apps ou com 'uninstall')."
  tv_session_start
  tizen install -s "$TARGET" -n GlassTV.wgt -- "$DIST"
}

cmd_run() {
  need_cli; need_tv
  confirm "Abrir a Glass TV na TV $TARGET."
  tv_session_start
  tizen run -s "$TARGET" -p "$APP_ID"
}

cmd_uninstall() {
  need_cli; need_tv
  confirm "REMOVER a Glass TV da TV $TARGET (as preferências salvas no app serão apagadas)."
  tv_session_start
  tizen uninstall -s "$TARGET" -p "$APP_ID"
}

cmd_disconnect() {
  need_cli; need_tv
  tv_session_end
  echo "Servidor do sdb encerrado."
}

case "${1:-}" in
  check) cmd_check ;;
  package) cmd_package ;;
  connect) cmd_connect ;;
  install) cmd_install ;;
  run) cmd_run ;;
  uninstall) cmd_uninstall ;;
  disconnect) cmd_disconnect ;;
  *) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
