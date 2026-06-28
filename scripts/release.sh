#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  VERSION="$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || true)"
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(date +%Y%m%d-%H%M%S)"
fi

RELEASE_DIR="$ROOT/release"
STAGE_DIR="$ROOT/build/release-$VERSION"
CLI_STAGE="$STAGE_DIR/life-matters-cli-$VERSION-win64"
GUI_STAGE="$STAGE_DIR/life-matters-gui-$VERSION"
CLI_ZIP="$RELEASE_DIR/life-matters-cli-$VERSION-win64.zip"
GUI_ZIP="$RELEASE_DIR/life-matters-gui-$VERSION.zip"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

zip_dir() {
  local source_dir="$1"
  local zip_path="$2"
  local source_win
  local zip_win

  source_win="$(cygpath -w "$source_dir")"
  zip_win="$(cygpath -w "$zip_path")"

  rm -f "$zip_path"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
    "\$ErrorActionPreference = 'Stop'; Compress-Archive -Path '$source_win\*' -DestinationPath '$zip_win' -Force"
}

echo "Release version: $VERSION"

need_cmd npm
need_cmd pyinstaller
need_cmd powershell.exe
need_cmd cygpath

rm -rf "$STAGE_DIR"
mkdir -p "$RELEASE_DIR" "$CLI_STAGE" "$GUI_STAGE"

echo
echo "== Build CLI =="
(
  cd "$ROOT"
  pyinstaller cli/build.spec --noconfirm --clean
)

if [[ ! -f "$ROOT/dist/lm-sim.exe" ]]; then
  echo "Expected CLI executable was not produced: dist/lm-sim.exe" >&2
  exit 1
fi

cp "$ROOT/dist/lm-sim.exe" "$CLI_STAGE/"
cp "$ROOT/LICENSE" "$CLI_STAGE/"
cp "$ROOT/README.md" "$CLI_STAGE/"

if [[ -d "$ROOT/models" ]]; then
  mkdir -p "$CLI_STAGE/models"
  cp -R -L "$ROOT/models/." "$CLI_STAGE/models/"
else
  cat > "$CLI_STAGE/MODELS.txt" <<'EOF'
No models folder was included because ./models was not found at build time.

Download or clone the Life Matters model repository, then place the models
folder next to lm-sim.exe before running the CLI.
EOF
fi

cat > "$CLI_STAGE/RUN_CLI.txt" <<'EOF'
Life Matters CLI release

Run from this folder:

  lm-sim.exe models/<path-to-model.yaml>
  lm-sim.exe models/<path-to-model.yaml> --sim-only
  lm-sim.exe models/<path-to-model.yaml> --opt-only

The executable expects models/ to be next to lm-sim.exe.
Results are written to output/.
EOF

echo
echo "== Build GUI =="
(
  cd "$ROOT/gui"
  npm ci
  npm run build
)

cp -R "$ROOT/gui/dist/." "$GUI_STAGE/"
cp "$ROOT/LICENSE" "$GUI_STAGE/"

cat > "$GUI_STAGE/RUN_GUI.txt" <<'EOF'
Life Matters GUI static release

This zip contains the built Vite frontend only. It must be served by a static
web server and needs the Life Matters FastAPI backend available at /api.

For local inspection:

  cd this-folder
  python -m http.server 5173

For production, serve these files behind Nginx/Caddy and reverse-proxy /api
to the backend service.
EOF

echo
echo "== Zip packages =="
zip_dir "$CLI_STAGE" "$CLI_ZIP"
zip_dir "$GUI_STAGE" "$GUI_ZIP"

echo
echo "Done:"
echo "  $CLI_ZIP"
echo "  $GUI_ZIP"
