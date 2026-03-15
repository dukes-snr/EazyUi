#!/usr/bin/env bash
set -euo pipefail

npm install --include=dev --workspace=@eazyui/mcp-server --include-workspace-root
npm run build --workspace=@eazyui/mcp-server
