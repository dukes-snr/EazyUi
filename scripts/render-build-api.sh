#!/usr/bin/env bash
set -euo pipefail

npm install --include=dev --workspace=@eazyui/api --workspace=@eazyui/shared --include-workspace-root
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
rm -rf apps/api/dist
npm run build --workspace=@eazyui/shared
npm run build --workspace=@eazyui/api
