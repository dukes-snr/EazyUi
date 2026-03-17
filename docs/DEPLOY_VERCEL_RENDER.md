# Deploying EazyUI with Vercel + Render

This repo is now set up for the split deployment model:

- `apps/web` on Vercel
- `apps/api` on Render as a public web service
- `apps/mcp-server` on Render as a private service

## Why this split

- The web app is a standard Vite SPA and fits Vercel well.
- The API now uses Postgres-backed persistence and Playwright rendering, which fit better on a long-running Node service than on Vercel Functions.
- The MCP server is an internal Fastify service and fits naturally on Render's private network.

## Repo files used for deployment

- `vercel.json`: frontend-only Vercel build output and SPA rewrites
- `.vercelignore`: excludes the legacy root `api/` Vercel function wrapper from upload
- `render.yaml`: Render Blueprint for `eazyui-api` and `eazyui-mcp-server`
- `.env.render-api.example`: Render environment template for the API service
- `.env.render-mcp.example`: Render environment template for the MCP private service
- `.env.vercel.example`: Vercel environment template for the web app
- `scripts/render-build-api.sh`: Render build script for the API service
- `scripts/render-build-mcp.sh`: Render build script for the MCP service
- `scripts/render-start-mcp.sh`: derives `EAZYUI_API_BASE_URL` from the API service's internal Render hostname

## 1. Deploy the backend on Render

1. Push this branch to GitHub.
2. In Render, choose `New > Blueprint`.
3. Point Render at this repository and import `render.yaml`.
4. Render will create:
   - `eazyui-api` as a public web service
   - `eazyui-mcp-server` as a private service
5. Fill in all `sync: false` environment variables before the first deploy.
6. Use `.env.render-api.example` and `.env.render-mcp.example` as the source of truth while entering values into Render.

### Important API env vars

Required for most production flows:

- `FRONTEND_URL=https://<your-vercel-domain>`
- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `INTERNAL_API_KEY` is generated automatically by Render

Optional or feature-specific:

- `FIRECRAWL_API_KEY`
- `GROQ_API_KEY`
- `NVIDIA_API_KEY`
- `POSTHOG_API_KEY`
- `POSTHOG_HOST`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_AUDIENCE_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_TEAM_MONTHLY`
- `STRIPE_PRICE_TOPUP_1000`
- `FIREBASE_STORAGE_BUCKET`

### Important MCP env vars

Required:

- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`

Handled automatically by `render.yaml`:

- `MCP_INTERNAL_API_KEY` is copied from the API service's `INTERNAL_API_KEY`
- `EAZYUI_API_HOSTPORT` is derived from the API service's internal Render network address

## 2. Deploy the frontend on Vercel

1. Create a new Vercel project from this repository.
2. Keep the project root at the repository root.
3. Vercel will use `vercel.json` automatically.
4. Add the required frontend environment variables using `.env.vercel.example`.

### Required Vercel env vars

- `VITE_API_BASE_URL=https://<your-render-api-domain>/api`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Optional:

- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

## 3. Post-deploy checks

After both services are live:

1. Set `FRONTEND_URL` on Render to the final Vercel production URL.
2. Redeploy `eazyui-api` after changing `FRONTEND_URL`.
3. Add your Vercel domain to Firebase Authentication authorized domains.
4. If billing is enabled, point Stripe webhooks to:

```txt
https://<your-render-api-domain>/api/stripe/webhook
```

5. Verify these endpoints:

- `https://<your-render-api-domain>/api/health`
- `https://<your-vercel-domain>`
- `https://<your-render-api-domain>/api/models`

## Environment checklist

Use this when entering variables into Render and Vercel.

### Vercel web

Required for the app to boot correctly:

- `VITE_API_BASE_URL`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Optional:

- `VITE_FIREBASE_MEASUREMENT_ID` for Firebase Analytics
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_ENABLE_STORAGE_RESTORE`
- `VITE_ENABLE_STORAGE_UPLOADS`

### Render API

Required for core product behavior:

- `FRONTEND_URL`
- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`

Required for this Render deployment shape, but already handled by the Blueprint:

- `HOST`
- `DATA_DIR`
- `INTERNAL_API_KEY`

Required to connect persistence:

- `DATABASE_URL`

Required only if you use these features:

- `FIRECRAWL_API_KEY` for URL reference scraping
- `GROQ_API_KEY` for Groq-backed models and audio transcription
- `NVIDIA_API_KEY` for NVIDIA-backed models
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_TEAM_MONTHLY`
- `STRIPE_PRICE_TOPUP_1000`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_AUDIENCE_EMAIL`
- `POSTHOG_API_KEY`

Recommended but not strictly required:

- `MCP_API_KEY_PEPPER`
- `FIREBASE_STORAGE_BUCKET`
- `POSTHOG_HOST`

Optional tuning:

- `GEMINI_MODEL`
- `GEMINI_IMAGE_MODEL`
- `GEMINI_IMAGE_FALLBACK_MODEL`
- `FIRECRAWL_API_BASE_URL`
- `GROQ_MODEL`
- `GROQ_WHISPER_MODEL`
- `NVIDIA_MODEL`
- `API_BODY_LIMIT`
- `BILLING_PAID_ONLY_OPERATIONS`
- `BILLING_CREDITS_PER_USD`
- `BILLING_USAGE_MARKUP_MULTIPLIER`
- `BILLING_USAGE_MIN_CREDITS`
- `BILLING_USAGE_FALLBACK_INPUT_USD_PER_1M`
- `BILLING_USAGE_FALLBACK_OUTPUT_USD_PER_1M`

### Render MCP

Required:

- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`

Required for connectivity, but already handled by the Blueprint:

- `MCP_INTERNAL_API_KEY`
- `EAZYUI_API_HOSTPORT`
- `MCP_SERVER_HOST`
- `MCP_SERVER_PORT`

Recommended:

- `FIREBASE_STORAGE_BUCKET`

Only needed if you are not using the Blueprint wiring:

- `EAZYUI_API_BASE_URL`

Optional tuning:

- `MCP_ENABLE_MUTATIONS`
- `MCP_REQUIRE_AUTH`
- `MCP_DEV_UID`
- `MCP_FETCH_TIMEOUT_MS`
- `MCP_FETCH_HEAVY_TIMEOUT_MS`
- `MCP_FETCH_RETRIES`
- `FIREBASE_PROJECT_ID`

## Persistence notes

The API now uses:

- `DATABASE_URL` for the Postgres connection string
- `DATA_DIR` only for generated local cache/files

The Render Blueprint configures:

- `DATA_DIR=/tmp/eazyui`
- `DATABASE_URL` as a manual secret you provide

For production, point `DATABASE_URL` at a managed Postgres instance such as Render Postgres, Neon, Supabase, or Railway Postgres.
