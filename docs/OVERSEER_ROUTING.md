# Assistant overseer and resource routing

All web assistant turns now pass through `POST /api/assistant/oversee` before planners, HTML generation, edits, image generation, reference rendering, or URL retrieval.

## Decision contract

The server returns one intent, one action, confidence, exact screen targets, a minimal resource plan, and whether confirmation is required. Supported actions are:

- `respond`: ordinary assistant answer; no project resources.
- `clarify`: asks one narrowing question; no project resources.
- `inspect`: read-only project analysis.
- `plan`: non-mutating planner work.
- `generate`: create up to four authorized screens.
- `edit`: edit exact existing screen targets.
- `update_system`: update project design-system values.
- `generate_image`: create an image asset.
- `reject`: unsupported request.

Exact greetings, including `hi`, `hello`, and the common `high` typo, are handled deterministically without an LLM call. Model errors fail closed to clarification.

## Safety and resource gates

Model output is parsed with Zod and then constrained by deterministic policy. A model cannot authorize a mutation unless the user used explicit mutation language. Edits require exact existing targets. Low-confidence mutations become clarifications. Multi-screen edits, design-system changes, and generation above two screens require confirmation.

Approved plan or mutation decisions receive a short-lived HMAC action ticket. `/api/plan`, generation, edit, design-system, image, repair, completion, and synthesis routes validate its user and scope. Generation routes also enforce the authorized maximum screen count. Internal MCP calls bypass tickets only when their internal API credential resolves to the same user; a source header alone cannot bypass enforcement.

## Configuration

Task-model defaults live in `apps/api/src/config/aiModels.ts` under `AI_TASK_MODEL_DEFAULTS`. The overseer defaults to Groq `openai/gpt-oss-20b`; deployment can override it with `OVERSEER_MODEL`.

Required environment values:

```env
OVERSEER_MODE=active
OVERSEER_TICKET_MODE=shadow
OVERSEER_MODEL=openai/gpt-oss-20b
OVERSEER_MAX_OUTPUT_TOKENS=700
OVERSEER_TICKET_TTL_MS=300000
OVERSEER_TICKET_SECRET=<dedicated-random-secret>
```

`OVERSEER_TICKET_SECRET` falls back to `INTERNAL_API_KEY` or `AI_KEYS_ENCRYPTION_KEY` locally, but production should use a dedicated random secret.

## Rollout

1. Deploy with `OVERSEER_MODE=active` and `OVERSEER_TICKET_MODE=shadow`.
2. Review `overseer: decision` and `overseer action ticket rejected` logs. Compare intent, action, confidence, resources, target count, model, token use, and latency.
3. Add misroutes to `apps/api/src/services/overseer.test.ts` as golden cases.
4. When normal web, direct edit/image, plan, and internal MCP flows show no ticket warnings, set `OVERSEER_TICKET_MODE=required`.
5. Roll back ticket enforcement with `shadow` or `off`; disable the classifier with `OVERSEER_MODE=off` only during incident response.

The overseer call records token usage but charges zero product credits. Downstream planners and generators retain existing billing reservations and settlement.
