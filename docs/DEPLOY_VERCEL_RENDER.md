# Deploying EazyUI with Vercel + Render

This repo is now set up for the split deployment model:

- `apps/web` on Vercel
- `apps/api` on Render as a public web service
- `apps/mcp-server` on Render as a private service

## Why this split

- The web app is a standard Vite SPA and fits Vercel well.
- The API uses SQLite-backed persistence and Playwright rendering, which are a better fit for a long-running Node service with a persistent disk than for Vercel Functions.
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
   - a persistent disk mounted to `/var/data` for `eazyui-api`
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

## Persistence notes

The API now honors:

- `DATA_DIR` for generated local data
- `DATABASE_URL` for the SQLite database file path

The Render Blueprint mounts a persistent disk at `/var/data` and configures:

- `DATA_DIR=/var/data/eazyui`
- `DATABASE_URL=/var/data/eazyui/eazyui.db`

That keeps the billing and project SQLite file on persistent storage instead of the container filesystem.

## Remaining recommendation

This setup is production-usable, but billing and project persistence still rely on SQLite. The next backend hardening step is to move that data to a managed database.
