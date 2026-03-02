# EazyUI Credit System (V1 Draft)

Status: Approved for implementation (V1)
Owner: Product + API
Last updated: 2026-03-03

## 1) Goals

- Meter paid AI operations in a predictable way.
- Prevent abuse by enforcing credits server-side.
- Show users clear balances, costs, and history.
- Support subscription tiers + optional top-ups.

## 2) Non-goals (V1)

- Exact token-level billing reconciliation across every provider response.
- Team shared wallets and seat-level permissions.
- Invoicing/tax engine (handled by payment provider later).

## 3) Core Decision

Use **credits as the billing unit**.  
Each metered action consumes fixed credits (with optional model multipliers), so users can understand cost before sending.

## 4) Why server-side enforcement is required

Current app state:

- Web app writes project data directly to Firestore.
- API generation endpoints are currently callable without auth.

If credit checks are only client-side, they can be bypassed.  
So V1 must enforce:

1. Every metered API request includes Firebase ID token (`Authorization: Bearer <token>`).
2. API verifies token using Firebase Admin.
3. API debits credits atomically before/around expensive calls.

## 5) Billing Unit and Pricing Draft

## 5.1 Credit packs / plans (draft numbers)

- Free: 300 credits/month, no rollover
- Pro: 3,000 credits/month
- Team: 15,000 credits/month
- Top-up: 1,000 credits pack (expires after 12 months)

## 5.2 Operation costs (draft numbers)

- `route plan` (`/api/plan` phase=`route`): 0
- `chat assist` planner response: 0
- `design system generation` (`/api/design-system`): bundled in first generation flow; standalone calls cost 8
- `screen generation` (`/api/generate-stream` or `/api/generate`): 20 base + 8 per completed screen
- `edit screen` (`/api/edit`): 14
- `partial completion repair` (`/api/complete-screen`): 4
- `image generation` (`/api/generate-image`): 18
- `screen image synthesis` (`/api/synthesize-screen-images`): 10 base + 6 per generated image
- `audio transcription` (`/api/transcribe-audio`): 4 per started minute

## 5.3 Model multipliers (draft)

- Fast profile: `x0.8`
- Quality/default profile: `x1.0`
- Premium/expensive model override: `x1.4`

Final charge = `roundUp(baseCost * multiplier)`.

## 6) Charge Policy

V1 policy for simplicity and fairness:

- Use **reservation + settlement**.
- Before execution: reserve estimated credits.
- On success: settle with final charge.
- On failure before model response: full release/refund.
- On user cancel after upstream request has started: charge 50% of reserved credits.

This avoids undercharging on long operations and avoids overcharging on hard failures.

## 7) Data Model (Firestore)

Use server-managed docs under each user:

- `users/{uid}/billing/profile`
  - `planId`
  - `balanceCredits`
  - `monthlyCreditsRemaining`
  - `topupCreditsRemaining`
  - `periodStartAt`
  - `periodEndAt`
  - `status` (`active|past_due|cancelled`)
  - `updatedAt`

- `users/{uid}/billing/ledger/{entryId}`
  - `type` (`grant|reserve|settle|refund|expire|adjustment`)
  - `operation` (`design_system|generate|edit|...`)
  - `creditsDelta` (negative for spend)
  - `balanceAfter`
  - `requestId`
  - `projectId`
  - `metadata` (model, screenCount, durations)
  - `createdAt`

- `users/{uid}/billing/reservations/{reservationId}`
  - `status` (`open|settled|released|partially_settled`)
  - `reservedCredits`
  - `operation`
  - `requestId`
  - `expiresAt`
  - `createdAt`
  - `updatedAt`

## 8) API Contracts (Draft)

## 8.1 New endpoints

- `GET /api/billing/summary`
  - returns current balance, plan, period, low-credit threshold flags.

- `GET /api/billing/ledger?limit=50&cursor=...`
  - returns recent credit entries.

- `POST /api/billing/estimate`
  - input: intended action (generate/edit/etc), model profile, expected screen count.
  - output: estimated credits.

## 8.2 Metered endpoint behavior

For `/api/design-system`, `/api/generate`, `/api/generate-stream`, `/api/edit`, `/api/complete-screen`, `/api/generate-image`, `/api/synthesize-screen-images`, `/api/transcribe-audio`:

1. Authenticate user.
2. Compute estimate.
3. Reserve credits (atomic transaction).
4. Execute model call.
5. Settle reservation (charge/refund delta).
6. Return response + optional billing meta:
   - `creditsCharged`
   - `creditsRemaining`
   - `reservationId`

## 9) UX Draft

## 9.1 Where user sees credits

- Chat header: `### credits left` badge.
- Billing tab (already exists in settings): plan, remaining credits, ledger list.
- Before send (optional tooltip): “Estimated: X credits”.
- On insufficient credits: custom modal with:
  - required vs available
  - “Upgrade plan”
  - “Buy top-up”

## 9.2 Behavior in chat flow

First request flow:

1. User sends prompt.
2. Planner route (free).
3. Design system generation (0 additional charge when bundled in first generation).
4. User reviews DS bubble and clicks Proceed.
5. Screen generation (includes design-system bundle cost on first generation).

If insufficient credits at any charged step, block execution and show billing modal.

## 10) Logging and Observability

Add billing logs to existing route logs:

- `billing:estimate`
- `billing:reserve:start|success|fail`
- `billing:settle:success|refund`
- `billing:insufficient`

Each log includes:

- `traceId`
- `uid`
- `operation`
- `estimatedCredits`
- `chargedCredits`
- `remainingCredits`
- `reservationId`
- `requestId`

## 11) Security Rules

- Firestore billing collections must be **server-writable only** for sensitive fields.
- Client can read summary + ledger, but cannot directly mutate balances.
- All balance changes happen from API (or trusted server functions).

## 12) Rollout Plan

Phase 1: Instrumentation only

- Implement auth verification on API.
- Add billing estimate logs and “shadow charges” (no enforcement).
- Validate real usage and tune prices.

Phase 2: Soft enforcement

- Enforce on high-cost endpoints only (`generate`, `generate-stream`, `edit`, image endpoints).
- Show warnings when low credits.

Phase 3: Full enforcement

- Enforce on all metered endpoints.
- Launch Billing tab with ledger and purchase/upgrade links.

## 13) Finalized Decisions

1. Design system is included in the first generation bundle.
2. Cancelled jobs are charged at 50%.
3. Monthly credits roll over for paid plans.
4. Free tier launch allowance is 300 credits/month.
5. Stripe is the payment provider.

## 14) Recommended Next Step

Approve this draft with final numbers for:

- Plan allowances
- Per-operation credits
- Cancel policy
- Rollover policy

Then implementation can start with Phase 1 (instrumentation + auth + billing summary endpoint).
