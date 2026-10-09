#!/usr/bin/env bash
# Reinstala o app iOS (e o EspressoWatch embutido) no iPhone via Wi-Fi.
# Necessário a cada 7 dias com conta Apple gratuita.
#
# Uso: scripts/reinstall-ios.sh [--skip-web] [--no-watch]
#   --skip-web   não roda build do Vite nem cap sync (só recompila o nativo)
#   --no-watch   não instala direto no relógio
#
# Variáveis: IPHONE_ID, WATCH_ID (UDID; veja `xcrun devicectl list devices`)
set -euo pipefail

IPHONE_ID="${IPHONE_ID:-00008110-000A458A0CEBA01E}"
WATCH_ID="${WATCH_ID:-00008301-889228483479A02E}"
DERIVED_DATA="${DERIVED_DATA:-$HOME/Library/Caches/espresso-ios-build}"

SKIP_WEB=0
INSTALL_WATCH=1
for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    --no-watch) INSTALL_WATCH=0 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
WORKSPACE="$APP_DIR/ios/App/App.xcworkspace"
APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/App.app"
# PRODUCT_NAME do target EspressoWatch é "ESPresso"
WATCH_APP_PATH="$APP_PATH/Watch/ESPresso.app"

if ! xcrun devicectl device info details --device "$IPHONE_ID" >/dev/null 2>&1; then
  echo "iPhone ($IPHONE_ID) não acessível. Desbloqueie e confira o Wi-Fi." >&2
  exit 1
fi

if [ "$SKIP_WEB" -eq 0 ]; then
  echo "==> build web + cap sync ios"
  (cd "$APP_DIR" && npm run build && npx cap sync ios)
fi

echo "==> xcodebuild (scheme App, Debug)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme App \
  -configuration Debug \
  -destination "id=$IPHONE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  -quiet \
  build

echo "==> instalando no iPhone"
xcrun devicectl device install app --device "$IPHONE_ID" "$APP_PATH"

if [ "$INSTALL_WATCH" -eq 1 ]; then
  if [ -d "$WATCH_APP_PATH" ]; then
    echo "==> instalando no Apple Watch"
    xcrun devicectl device install app --device "$WATCH_ID" "$WATCH_APP_PATH" \
      || echo "aviso: falha ao instalar no relógio (iPhone instalou ok). Tente pelo app Watch ou Xcode." >&2
  else
    echo "aviso: $WATCH_APP_PATH não encontrado; pulando relógio." >&2
  fi
fi

echo "==> pronto"
