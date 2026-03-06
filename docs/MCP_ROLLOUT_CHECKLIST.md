# MCP Rollout Checklist (Concrete, File-Level)

This checklist is tied to the current repo structure and is intended to move from scaffold to production MCP.

## Implemented In This Pass
- [x] HTTP JSON-RPC MCP server with tool/resource methods.
- [x] Firebase-authenticated requests (`MCP_REQUIRE_AUTH=true` by default).
- [x] Firestore-backed project read/write/list for user-scoped projects.
- [x] Stateful mutating tools persist changes back to project data.
- [x] Real multi-screen edit persistence with merged descriptions.
- [x] Real exports: `html`, `png` (rendered), and `zip` (base64 payload).
- [x] Timeout/retry handling for upstream API calls.
- [x] Conflict support via `expectedUpdatedAt` and idempotent save key support.

## 0) Current Scaffold (Done)
- [x] Create MCP workspace package.
  - `apps/mcp-server/package.json`
  - `apps/mcp-server/tsconfig.json`
- [x] Add runnable server + JSON-RPC methods.
  - `apps/mcp-server/src/server.ts`
  - `apps/mcp-server/src/jsonrpc.ts`
- [x] Add tool/resource registry + validators.
  - `apps/mcp-server/src/mcp-tools.ts`
  - `apps/mcp-server/src/mcp-resources.ts`
  - `apps/mcp-server/src/schemas.ts`
- [x] Add upstream API adapter.
  - `apps/mcp-server/src/api-client.ts`
- [x] Add root scripts.
  - `package.json` (`dev:mcp`, `build:mcp`)

## 1) Shared Types Extraction (Required for stability)
- [ ] Extract API request/response contracts into `packages/shared` so `apps/api`, `apps/web`, and `apps/mcp-server` share one source.
  - Create: `packages/shared/src/types/mcp-api.ts`
  - Export from: `packages/shared/src/types/index.ts`
- [ ] Refactor `apps/web/src/api/client.ts` to import shared types instead of local duplicates.
- [ ] Refactor `apps/mcp-server/src/api-client.ts` to use shared contracts.

## 2) Auth + Authorization Hardening
- [ ] Add Firebase token verification in MCP server for every tool/resource call.
  - New file: `apps/mcp-server/src/auth.ts`
- [ ] Enforce project membership checks by calling protected API endpoints or dedicated membership endpoint.
  - Existing likely hook: `apps/api/src/services/firebaseAuth.ts`
- [ ] Add explicit auth failure codes in MCP responses (`unauthorized`, `forbidden`).

## 3) Tooling Completeness
- [ ] Implement `design_system.update` patch-mode instead of prompt-only fallback.
  - Add backend route in `apps/api/src/app.ts` (e.g. `POST /api/design-system/update`)
  - Add service function in `apps/api/src/services/gemini.ts` or dedicated DS service.
- [ ] Implement `project.export` actual execution path.
  - Reuse/extend export logic from web/canvas flow.
  - Add backend route in `apps/api/src/app.ts`.
- [ ] Add `screen.reorder`, `screen.delete`, `screen.create_empty` for full canvas manipulation.

## 4) Concurrency + Idempotency
- [ ] Add `idempotencyKey` to mutating tool schemas.
  - `apps/mcp-server/src/schemas.ts`
- [ ] Add optimistic concurrency argument (`expectedUpdatedAt`) on mutating tools.
- [ ] Enforce conflict checks in backend save/edit routes.
  - `apps/api/src/app.ts`
  - `apps/web/src/lib/firestoreData.ts` (if this is the write source of truth)

## 5) Billing + Usage Attribution
- [ ] Tag every MCP tool mutation with operation metadata for credits and usage events.
  - `apps/api/src/services/billing.ts`
  - `apps/api/src/app.ts` route handlers
- [ ] Add MCP-specific source label in usage history.
  - Candidate label: `source: "mcp_tool"`
- [ ] Surface tool-level usage in settings Usage tab.
  - `apps/web/src/.../settings` usage components

## 6) Observability and Traceability
- [ ] Propagate `traceId` and `mcp_session_id` end-to-end.
  - `apps/mcp-server/src/server.ts`
  - `apps/mcp-server/src/api-client.ts`
  - `apps/api/src/app.ts` logging payloads
- [ ] Add structured logs for:
  - tool selected
  - route decision
  - model used
  - credits charged
  - latency
- [ ] Add redaction policy for prompt/html in logs.

## 7) Reliability and Safety
- [ ] Add global timeout + retry policy per tool in MCP server.
  - `apps/mcp-server/src/api-client.ts`
- [ ] Add strict output guards (e.g. malformed html response handling).
  - `apps/mcp-server/src/mcp-tools.ts`
- [ ] Ensure post-edit sanitization path in API remains enforced.
  - `apps/api/src/services/gemini.ts` sanitizers

## 8) Transport + Client Integration
- [ ] Confirm target MCP client transport (HTTP JSON-RPC now, stdio optional later).
- [ ] If stdio needed, add `src/stdio.ts` bridge in mcp-server.
- [ ] Add connection docs for external agent clients.
  - Update `apps/mcp-server/README.md`

## 9) Test Plan (must-have before production)
- [ ] Unit tests for schema parsing and URI parsing.
  - `apps/mcp-server/src/schemas.ts`
  - `apps/mcp-server/src/mcp-resources.ts`
- [ ] Integration tests with local API:
  - `planner.route` -> `screen.edit` -> `project.save` flow
  - `screen.multi_edit` merged response integrity
- [ ] Failure tests:
  - no auth
  - insufficient credits
  - stale `expectedUpdatedAt`
  - network timeout/retry

## 10) Deployment
- [ ] Add environment variables to `.env.example`:
  - `MCP_SERVER_PORT`
  - `MCP_SERVER_HOST`
  - `MCP_ENABLE_MUTATIONS`
  - `EAZYUI_API_BASE_URL`
- [ ] Add process scripts/PM2 or container config for mcp-server.
- [ ] Add health checks and restart strategy.

## Suggested Implementation Order
1. Shared types extraction.
2. Auth and permission enforcement.
3. Complete missing tools (`design_system.update` patch + `project.export`).
4. Concurrency/idempotency.
5. Billing attribution.
6. Tests.
7. Deploy.
