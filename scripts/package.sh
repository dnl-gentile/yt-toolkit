#!/usr/bin/env bash
#
# Build the release ZIP: only the files the extension actually loads.
# Usage: npm run package   ->   dist/yt-toolkit-<version>.zip
#
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./manifest.json').version")"
PKG_VERSION="$(node -p "require('./package.json').version")"

if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "version mismatch: manifest.json=$VERSION package.json=$PKG_VERSION" >&2
  echo "these must agree before cutting a release" >&2
  exit 1
fi

OUT="dist/yt-toolkit-${VERSION}.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Everything the manifest references, plus what those files reference.
FILES=(
  manifest.json
  background.js
  analytics.js
  content_script_youtube.js
  content_script_searchapp.js
  options.html
  options.css
  options.js
  styles.css
  styles-overlay.css
  styles-toggles.css
  LICENSE
  PRIVACY.md
)
DIRS=(content lib icons)

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing file: $f" >&2; exit 1; }
  cp "$f" "$STAGE/"
done

for d in "${DIRS[@]}"; do
  [ -d "$d" ] || { echo "missing directory: $d" >&2; exit 1; }
  cp -R "$d" "$STAGE/"
done

# Authoring sources are not part of the extension.
rm -rf "$STAGE/icons/src"

# Syntax-check every script that ships.
while IFS= read -r js; do
  node --check "$js" || { echo "syntax error in $js" >&2; exit 1; }
done < <(find "$STAGE" -name '*.js')

mkdir -p dist
rm -f "$OUT"
( cd "$STAGE" && zip -qr - . -x '.*' ) > "$OUT"

echo "$OUT"
echo "  $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files, $(du -h "$OUT" | cut -f1)"
echo
echo "Load unpacked from the repo root for development."
echo "Upload this ZIP for a GitHub release or a Chrome Web Store submission."
