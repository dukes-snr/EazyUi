# MCP Setup and Usage (EazyUI)

## 1) Environment

Add these to your `.env` (or ensure they already exist):

```env
# Required for API and MCP auth verification
FIREBASE_SERVICE_ACCOUNT_JSON={...}
# or FIREBASE_SERVICE_ACCOUNT_BASE64=...

# API
PORT=3001
HOST=localhost
INTERNAL_API_KEY=<same-random-secret-used-by-MCP>

# MCP
MCP_SERVER_PORT=3010
MCP_SERVER_HOST=0.0.0.0
MCP_ENABLE_MUTATIONS=true
MCP_REQUIRE_AUTH=true
MCP_FETCH_TIMEOUT_MS=90000
MCP_FETCH_RETRIES=1
EAZYUI_API_BASE_URL=http://localhost:3001
MCP_INTERNAL_API_KEY=<same-random-secret-used-by-API>
```

Local insecure dev-only mode:

```env
MCP_REQUIRE_AUTH=false
MCP_DEV_UID=<firebase-user-uid>
```

Recommended local IDE mode (without interactive Firebase token in the IDE client):

```env
MCP_REQUIRE_AUTH=false
MCP_DEV_UID=<firebase-user-uid>
INTERNAL_API_KEY=<shared-secret>
MCP_INTERNAL_API_KEY=<same-shared-secret>
```

## 2) Start services

```bash
npm run dev:api
npm run dev:mcp
```

Health check:

```bash
curl http://localhost:3010/health
```

## 3) JSON-RPC request shape

Endpoint: `POST http://localhost:3010/mcp`

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <firebase-id-token>` (required unless auth is disabled)

Body template:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "project.get_context",
    "arguments": {
      "projectId": "your-project-id"
    }
  }
}
```

## 4) Available tools

- `project.list`
- `project.get_context`
- `project.create`
- `project.create_from_prompt`
- `design_system.accept_initial`
- `planner.route`
- `screen.generate`
- `screen.edit`
- `screen.multi_edit`
- `design_system.update`
- `project.save`
- `project.export` (`html`, `png`, `zip`)

### Optional model profile

For AI-heavy tools, pass:

```json
"modelProfile": "fast" | "balanced" | "quality"
```

Supported on:
- `project.create_from_prompt`
- `planner.route`
- `screen.generate`
- `screen.edit`
- `screen.multi_edit`
- `design_system.update`

## 4.1) Required first-step acceptance flow

For brand-new projects created with `project.create_from_prompt`:

1. call `project.create_from_prompt` (this stores a proposed design system),
2. call `design_system.accept_initial` for that `projectId`,
3. then proceed with normal `planner.route` / `screen.generate` / `screen.edit` flows.

## 5) Production recommendations

- Keep `MCP_REQUIRE_AUTH=true`.
- Put MCP behind HTTPS + gateway rate limits.
- Keep `MCP_ENABLE_MUTATIONS=true` only for trusted agent clients.
- Rotate Firebase service account secrets periodically.
- Forward and retain `x-trace-id` in all logs for incident debugging.
