#!/usr/bin/env bash
set -euo pipefail

npm install --include=dev --workspace=@eazyui/api --workspace=@eazyui/shared --include-workspace-root
# Render build containers do not allow privileged package installs, so only fetch the browser binary.
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-.playwright-browsers}" npx playwright install chromium --only-shell
rm -rf apps/api/dist
npm run build --workspace=@eazyui/shared
npm run build --workspace=@eazyui/api
