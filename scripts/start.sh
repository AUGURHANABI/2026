#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT="${DEPLOY_RUN_PORT:-5000}"

cd "${COZE_WORKSPACE_PATH}"

# Pre-load env vars via Python (so first request doesn't pay the cost)
python3 -c "
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f'{env_var.key}={env_var.value}')
except: pass
" > /dev/null 2>&1 &
PRELOAD_PID=$!

# Start Next.js server
npx next start -p "${PORT}" -H 0.0.0.0 &
NEXT_PID=$!

# Wait for server to be ready, then send warm-up request
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '' http://localhost:${PORT}/api/supabase-config 2>/dev/null; then
    echo "Server ready and warmed up on port ${PORT}"
    break
  fi
  sleep 1
done

# Wait for pre-load to finish (don't block if it takes too long)
wait ${PRELOAD_PID} 2>/dev/null || true

# Keep Next.js in foreground
wait ${NEXT_PID}
