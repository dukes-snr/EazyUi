#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${EAZYUI_API_HOSTPORT:-}" ]]; then
  export EAZYUI_API_BASE_URL="http://${EAZYUI_API_HOSTPORT}"
fi

npm run start --workspace=@eazyui/mcp-server
