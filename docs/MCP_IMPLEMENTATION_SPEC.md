# EazyUI MCP Implementation Spec

## Goal
Expose EazyUI project/canvas/chat operations through an MCP server so external AI agents can safely read context and perform actions (generate, edit, update design system, save, export) with full project awareness.

## Scope (v1)
- Read current project state (design system, screens, canvas doc, recent chat, usage state).
- Plan and execute screen actions (add/edit/multi-edit/delete/reorder).
- Update design system and apply token/typography/radius changes to existing screens.
- Save project and trigger snapshot refresh.
- Return structured operation logs/status for agent UX.

## Non-Goals (v1)
- Real-time multi-user CRDT sync.
- Direct browser automation.
- Arbitrary file-system execution.

## Architecture
1. `apps/api` hosts MCP server module (`/mcp` transport).
2. MCP tools call existing service layer:
   - planner: `designPlanner.ts`
   - generation/edit: `gemini.ts`
   - persistence: firestore save/load paths
3. MCP resources return project context snapshots with bounded size.
4. All write tools run through a single command handler with validation + audit logging.

## MCP Surface

### Resources
- `eazyui://project/{projectId}/summary`
  - name, platform, stylePreset, designSystem summary, screen list.
- `eazyui://project/{projectId}/screens`
  - screen ids, names, dimensions, status, short html snippet.
- `eazyui://project/{projectId}/design-system`
  - full design system (tokens, tokenModes, typography, radius, rules).
- `eazyui://project/{projectId}/chat/recent?limit=50`
  - recent messages with role/status/meta preview.

### Tools
- `project.get_context`
  - input: `{ projectId, includeHtml?: boolean, htmlLimit?: number }`
  - output: consolidated context payload.
- `planner.route`
  - input: `{ projectId, prompt, referenceScreenIds?: string[] }`
  - output: route decision (`chat_assist|generate|edit|multi_edit|...`).
- `screen.generate`
  - input: `{ projectId, prompt, targetScreenNames?: string[], temperature?: number }`
  - output: created/updated screens.
- `screen.edit`
  - input: `{ projectId, screenId, instruction, temperature?: number }`
  - output: updated html + description.
- `screen.multi_edit`
  - input: `{ projectId, screenIds: string[], instruction, temperature?: number }`
  - output: per-screen results + merged summary.
- `design_system.update`
  - input: `{ projectId, patch, applyToExistingScreens?: boolean }`
  - output: updated design system + affected screen count.
- `project.save`
  - input: `{ projectId, reason?: string }`
  - output: `{ savedAt, snapshotUpdated: true }`.
- `project.export`
  - input: `{ projectId, format }`
  - output: export job/result.

## Tool Contracts
- Every tool response includes:
  - `traceId`
  - `status: success|error`
  - `durationMs`
  - `operationSummary`
- Every write tool accepts `idempotencyKey` (optional but recommended).

## Auth & Access
- Auth: Firebase ID token (user-scoped).
- Authorization: only project owner/member can read/write.
- Rate limits:
  - planner/read tools: higher limits.
  - generation/edit tools: stricter limits by credits/plan.
- Reject tools when credits are insufficient with machine-readable code.

## Consistency Rules
- Always fetch latest project revision before write.
- Use optimistic concurrency:
  - input may include `expectedUpdatedAt`.
  - reject with conflict if stale.
- After successful write:
  - persist project,
  - refresh snapshots,
  - return updated revision markers.

## Observability
- Log each MCP call as structured JSON:
  - userId, projectId, tool, traceId, route/action decision, model, tokens/cost, duration, result.
- Add `mcp_session_id` for grouping related tool chains.

## Safety
- HTML sanitization/normalization pipeline remains mandatory post-generation/edit.
- Enforce theme/token normalization and map-image policies.
- Validate tool inputs with strict schemas (zod).

## Suggested Phased Delivery

### Phase 1: Read-Only MCP
- Implement resources + `project.get_context`.
- Implement auth and project permission checks.
- Add structured logs.

### Phase 2: Planner + Single Writes
- Add `planner.route`, `screen.edit`, `screen.generate`, `project.save`.
- Add concurrency guard (`expectedUpdatedAt`).

### Phase 3: Multi-Action + DS Ops
- Add `screen.multi_edit`, `design_system.update`.
- Return merged descriptions for multi-screen operations.
- Add rollback strategy for partial failures.

### Phase 4: Production Hardening
- Rate limits by plan/credits.
- Full audit trail + usage ledger tagging per tool.
- Integration tests against seeded projects.

## Test Plan
- Unit:
  - input schema validation, auth checks, normalization transforms.
- Integration:
  - planner route -> edit/generate -> save -> load consistency.
  - multi-edit with partial failures.
- E2E:
  - agent applies DS update and verifies screen parity in both themes.

## Open Decisions
- Transport choice: SSE vs Streamable HTTP vs WebSocket MCP transport.
- Conflict policy: reject-only vs auto-merge for safe operations.
- Whether to expose raw HTML fully in resources or tool-only gated access.

## Minimal File Plan
- `apps/api/src/mcp/server.ts`
- `apps/api/src/mcp/tools/*.ts`
- `apps/api/src/mcp/resources/*.ts`
- `apps/api/src/mcp/schemas.ts`
- `apps/api/src/mcp/auth.ts`
- `apps/api/src/mcp/logger.ts`

