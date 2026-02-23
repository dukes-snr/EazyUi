#!/usr/bin/env bash
set -euo pipefail

npm run build --workspace=@eazyui/shared
npm run build --workspace=@eazyui/renderer
npm run build --workspace=@eazyui/web

if [ -d "apps/web/dist" ]; then
  OUT_DIR="apps/web/dist"
elif [ -d "dist" ]; then
  OUT_DIR="dist"
else
  echo "No build output directory found"
  exit 1
fi

rm -rf .vercel-dist
cp -r "$OUT_DIR" .vercel-dist
rm -rf dist
mv .vercel-dist dist
