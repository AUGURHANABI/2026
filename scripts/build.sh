#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1

echo "Building the Next.js project..."
pnpm next build

echo "Pre-loading environment variables..."
node -e "
const { loadEnvAsync } = require('./.next/server/chunks/_9c9e54a1._.js').default || {};
" 2>/dev/null || echo "Pre-load skipped (will load on first request)"

echo "Build completed successfully!"
