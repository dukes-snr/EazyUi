# EazyUI MCP Server (Scaffold)

This workspace provides a production-ready MCP-compatible JSON-RPC server that:

- verifies Firebase auth tokens,
- reads/writes project state directly from Firestore (`users/{uid}/projects/{projectId}`),
- calls existing AI routes from `apps/api` for planner/generate/edit/design-system,
- supports HTML/PNG/ZIP exports.

## Run

```bash
npm run dev:mcp
```

Default config:

- `MCP_SERVER_PORT=3010`
- `MCP_SERVER_HOST=0.0.0.0`
- `EAZYUI_API_BASE_URL=http://localhost:3001`
- `MCP_INTERNAL_API_KEY=` (optional but recommended for server-to-server API auth)
- `MCP_ENABLE_MUTATIONS=true`
- `MCP_REQUIRE_AUTH=true`
- `MCP_DEV_UID=` (used only when `MCP_REQUIRE_AUTH=false`)
- `MCP_FETCH_TIMEOUT_MS=90000`
- `MCP_FETCH_HEAVY_TIMEOUT_MS=420000` (used for long AI routes: generate/edit/design-system)
- `MCP_FETCH_RETRIES=1`

## Endpoints

- `GET /health`
- `POST /mcp` (JSON-RPC)

## Implemented MCP methods

- `initialize`
- `ping`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

## Current tool coverage

Connected:
- `project.list`
- `project.get_context`
- `project.create`
- `project.create_from_prompt`
- `design_system.accept_initial`
- `planner.route`
- `screen.generate`
- `screen.edit`
- `screen.multi_edit`
- `project.save`
- `design_system.update` (prompt + patch + optional full-screen restyle)
- `project.export` (`html`, `png`, `zip`)

### Model profile support

These tools accept `modelProfile: "fast" | "balanced" | "quality"`:

- `project.create_from_prompt`
- `planner.route`
- `screen.generate`
- `screen.edit`
- `screen.multi_edit`
- `design_system.update`

`balanced` uses backend defaults; `fast` prefers quicker models; `quality` prefers higher-quality models.

### Initial prompt rule

`project.create_from_prompt` now creates the project with a **pending design-system proposal**.
You must call `design_system.accept_initial` before first screen generation/edit flows proceed.

## Authentication

When `MCP_REQUIRE_AUTH=true` (default), send a Firebase ID token:

```http
Authorization: Bearer <firebase_id_token>
```

The MCP server will only read/write under that authenticated user's `users/{uid}` namespace.

MCP also supports API keys created from the web settings page:

```http
Authorization: Bearer eazy_mcp_<keyId>_<secret>
```

or:

```http
x-api-key: eazy_mcp_<keyId>_<secret>
```

### Server-to-server API auth bridge

If your MCP client cannot send user Firebase tokens to the API routes, configure:

- `INTERNAL_API_KEY` in `apps/api`
- `MCP_INTERNAL_API_KEY` in MCP server (same value)

MCP will forward:

- `x-internal-api-key`
- `x-eazyui-uid`

and API will trust those headers only when `INTERNAL_API_KEY` is set and matches.

## Minimal JSON-RPC example

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "project.get_context",
    "arguments": {
      "projectId": "your-project-id",
      "includeHtml": true
    }
  }
}
```
