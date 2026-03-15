#!/usr/bin/env bash
set -euo pipefail

npm install --include=dev --workspace=@eazyui/api --workspace=@eazyui/shared --include-workspace-root
npm run build --workspace=@eazyui/shared
npm run build --workspace=@eazyui/api
