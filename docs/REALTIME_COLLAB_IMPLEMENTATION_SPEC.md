# Realtime Collaboration Implementation Spec (v1)

## Objective
Enable multiple users to collaborate on the same project canvas and screens in realtime with low-latency updates, presence awareness, and safe conflict handling.

## Current State (Baseline)
- Project persistence is snapshot-oriented (`designSpec`, `canvasDoc`, `chatState`) via save/load.
- Data is primarily stored under user-scoped paths (`users/{uid}/projects/{projectId}`).
- Autosave and manual save are single-writer friendly; concurrent edits can overwrite each other.
- No shared membership model, no realtime listeners for live project edits, no presence/cursor protocol.

## Scope
### In scope (v1)
- Shared project membership (owner/editor/viewer).
- Realtime sync for:
  - Board positions and selection context.
  - Screen HTML edits.
  - Chat messages.
- Presence (online users, active screen, last seen).
- Optimistic updates with server-side version checks.
- Basic conflict handling (reject/merge retry for stale versions).

### Out of scope (v1)
- Full CRDT for HTML text-level concurrent editing.
- Cross-project workspace presence.
- Granular per-component ACL rules.

## Architecture Choice
Use **Firestore realtime listeners + operation documents** as primary transport (no websocket service required for v1).

Why:
- Already using Firebase in web app.
- Reduces infra complexity.
- Supports progressive rollout.

## Data Model
Use shared project root (not owner-only path):
- `projects/{projectId}`
  - `meta`:
    - `name`, `ownerId`, `createdAt`, `updatedAt`
    - `activeVersion` (number)
  - `members/{uid}`:
    - `role`: `owner | editor | viewer`
    - `status`: `active | invited | removed`
  - `presence/{uid}`:
    - `displayName`, `avatarUrl`, `online`, `activeScreenId`, `cursor`, `updatedAt`
  - `screens/{screenId}`:
    - `name`, `html`, `width`, `height`, `version`, `updatedAt`, `updatedBy`
  - `boards/{boardId}`:
    - `screenId`, `x`, `y`, `width`, `height`, `version`, `updatedAt`, `updatedBy`
  - `chat/messages/{messageId}`
    - existing message payload + `createdBy`
  - `ops/{opId}`:
    - append-only operation log for reconciliation/audit
    - `{ kind, target, payload, baseVersion, actorId, createdAt }`

## Security Rules
Add Firestore rules:
- Read access: active member.
- Write access:
  - `owner|editor`: screens, boards, chat, ops, presence (self-presence only).
  - `viewer`: read-only.
- Membership updates:
  - owner only (except accepting own invite).

## Sync Protocol
## 1) Connect
- Client loads project + membership.
- Start listeners:
  - `screens`, `boards`, `chat/messages`, `presence`.

## 2) Write path (editor)
- Client sends op with `baseVersion`.
- Server/client transaction:
  - Validate role.
  - Validate current target version equals `baseVersion`.
  - Apply mutation.
  - Increment target `version`.
  - Write op log.

## 3) Conflict path
- If version mismatch:
  - Reject op with `stale_version`.
  - Client refetches latest target doc.
  - Reapply local intent and retry once.
  - If still conflicting, show "updated by teammate" prompt.

## Presence
- Heartbeat every 15s to `presence/{uid}`.
- On tab hide/unload, set `online=false`.
- Track:
  - active screen id
  - selection summary (optional)
  - last activity timestamp

UI:
- collaborator avatars in canvas header.
- optional colored outline on screen currently edited by someone else.

## API/Service Changes
## Backend/API
- Add collaboration endpoints:
  - `POST /api/projects/:id/invite`
  - `POST /api/projects/:id/members/:uid/role`
  - `POST /api/projects/:id/ops`
  - `GET /api/projects/:id/members`
- Add project migration utility from user-scoped to shared root.

## Web App
- New `collab-store`:
  - member list, presence map, sync status, last server version.
- Replace full-project autosave writes with op-based writes for live sessions.
- Keep periodic snapshot checkpoints for recovery.

## Editor/Canvas Integration
- Board drag:
  - emit `board.move` ops instead of only local set + periodic snapshot.
- Screen edit panel operations:
  - emit `screen.patch` ops.
- Chat actions:
  - append message docs in realtime collection.
- Undo/Redo:
  - local-first for uncommitted operations.
  - optionally "operation undo" only for actor's latest reversible ops.

## Notifications
- Generate notifications from ops:
  - member joined/left
  - screen edited
  - conflict detected
  - long-running AI job started/completed

## AI Job Coordination
- Add lock doc per screen:
  - `locks/screens/{screenId}` with TTL.
- Planner/edit/generate checks lock before applying.
- If locked by another editor, show takeover prompt.

## Performance Targets
- Presence update visible in <2s.
- Board move propagation <300ms median.
- Screen patch propagation <500ms median.
- Reconnect recovery <3s after network return.

## Rollout Plan
## Phase 1 (Foundation)
- Membership model + security rules.
- Realtime listeners for screens/boards/chat.
- Presence basics.

## Phase 2 (Operational Writes)
- Versioned op writes + conflict handling.
- Board move + screen patch ops.
- UI conflict prompts.

## Phase 3 (Polish)
- AI locks/queue coordination.
- Activity feed + richer notifications.
- Admin tooling and migration completion.

## Risks and Mitigations
- Overwrites under concurrent edits:
  - mitigated by version checks + retry logic.
- Security rule mistakes:
  - add emulator tests for owner/editor/viewer matrices.
- Cost spikes from high-frequency writes:
  - debounce move ops, batch low-priority presence writes.

## Test Plan
- Unit:
  - version conflict resolver
  - role gating
- Integration (Firestore emulator):
  - 2 editors moving same board
  - viewer cannot write
  - invite/role changes
- E2E:
  - two browsers, same project, simultaneous edit + chat + presence.

## Acceptance Criteria
- Two editors can move/edit in same project and see updates live.
- Version conflicts do not silently overwrite teammate changes.
- Presence shows active collaborators and active screen.
- Viewer role cannot mutate project data.
- Existing single-user flow remains functional.
