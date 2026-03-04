#!/bin/bash
#
# Build the Pact MCP server as a self-contained ESM bundle and copy to resources.
# Run this after making changes to ~/pact/ source code.
#
# Usage: scripts/sync-pact-server.sh [/path/to/pact]  (default: ~/pact)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PACT_DIR="${1:-$HOME/pact}"
TARGET_DIR="$ROOT_DIR/resources/pact-mcp-server"
TARGET_FILE="$TARGET_DIR/index.js"
META_FILE="$TARGET_DIR/.build-meta"

# --- Validate source ---

if [ ! -d "$PACT_DIR" ]; then
  echo "ERROR: Pact source directory not found at $PACT_DIR"
  echo "Usage: $0 [/path/to/pact]"
  exit 1
fi

if [ ! -f "$PACT_DIR/src/index.ts" ]; then
  echo "ERROR: Expected entry point not found at $PACT_DIR/src/index.ts"
  exit 1
fi

# Check for uncommitted changes (warning only — don't block)
if [ -d "$PACT_DIR/.git" ]; then
  cd "$PACT_DIR"
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "WARNING: Pact repo has uncommitted changes — bundle will include them"
  fi
  PACT_COMMIT="$(git rev-parse HEAD)"
  PACT_COMMIT_SHORT="$(git rev-parse --short HEAD)"
  PACT_DIRTY=""
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    PACT_DIRTY="-dirty"
  fi
  cd - > /dev/null
else
  PACT_COMMIT="unknown"
  PACT_COMMIT_SHORT="unknown"
  PACT_DIRTY=""
fi

# --- Build ---

echo "Building Pact MCP server from $PACT_DIR (${PACT_COMMIT_SHORT}${PACT_DIRTY})..."

TEMP_OUTPUT="$(mktemp)"
trap "rm -f $TEMP_OUTPUT" EXIT

cd "$PACT_DIR"
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile="$TEMP_OUTPUT" \
  --banner:js=$'#!/usr/bin/env node\nimport { createRequire } from \'node:module\'; const require = createRequire(import.meta.url);'

if [ ! -s "$TEMP_OUTPUT" ]; then
  echo "ERROR: esbuild produced empty output"
  exit 1
fi
cd - > /dev/null

# --- Copy to resources ---

mkdir -p "$TARGET_DIR"
cp "$TEMP_OUTPUT" "$TARGET_FILE"
chmod +x "$TARGET_FILE"

# Ensure package.json with "type": "module" exists so Node treats .js as ESM.
# The pact source uses top-level await which requires ESM.
PKG_JSON="$TARGET_DIR/package.json"
if [ ! -f "$PKG_JSON" ]; then
  echo '{ "type": "module" }' > "$PKG_JSON"
fi

# --- Write build metadata ---

BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUNDLE_SIZE="$(wc -c < "$TARGET_FILE" | tr -d ' ')"
BUNDLE_LINES="$(wc -l < "$TARGET_FILE" | tr -d ' ')"

cat > "$META_FILE" << EOF
{
  "source": "$PACT_DIR",
  "commit": "${PACT_COMMIT}${PACT_DIRTY}",
  "builtAt": "$BUILT_AT",
  "bundleSize": $BUNDLE_SIZE,
  "bundleLines": $BUNDLE_LINES,
  "command": "npx esbuild src/index.ts --bundle --platform=node --format=esm --target=node20 --banner:js='shebang+createRequire'"
}
EOF

echo "Pact MCP server synced:"
echo "  Source:  $PACT_DIR @ ${PACT_COMMIT_SHORT}${PACT_DIRTY}"
echo "  Output:  $TARGET_FILE"
echo "  Size:    $(du -h "$TARGET_FILE" | cut -f1) ($BUNDLE_LINES lines)"
echo "  Meta:    $META_FILE"
