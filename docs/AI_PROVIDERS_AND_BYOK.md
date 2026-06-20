# AI providers, models, and BYOK

The canonical routing catalog is [`apps/api/src/config/aiModels.ts`](../apps/api/src/config/aiModels.ts). Change Fast/Pro defaults, enable or disable catalog entries, add models, and update provider documentation links there. The web app requests this catalog from `GET /api/models`; it does not keep its own provider list.

## Status model

- `active`: selected by a default Fast or Pro profile.
- `available`: can be selected when a workspace key or user key is configured.
- `disabled`: retained for quick restoration but never selected automatically.

The default routing is Fast → Gemini 2.5 Flash and Pro → NVIDIA Kimi K2.6. A signed-in user can override both mappings from Settings. The client sends `profile:fast` or `profile:quality`; the API resolves the actual provider and model per user.

## Key sources and official setup

| Provider | Key/setup page | Access note |
|---|---|---|
| Google Gemini | [Google AI Studio](https://aistudio.google.com/app/apikey) | Gemini API publishes a free tier for eligible models/projects; limits and regional eligibility vary. |
| Groq | [GroqCloud keys](https://console.groq.com/keys) | Developer access includes rate-limited usage; check current limits in the console. |
| NVIDIA NIM | [NVIDIA build](https://build.nvidia.com/) | Hosted API access commonly starts with evaluation credits; current entitlement is account-specific. |
| OpenRouter | [OpenRouter keys](https://openrouter.ai/settings/keys) | Models suffixed `:free` can be used subject to OpenRouter limits. |
| Cloudflare Workers AI | [Cloudflare API tokens](https://dash.cloudflare.com/profile/api-tokens) | Workers AI has a documented daily free allocation, then usage billing. Account ID is also required. |
| Mistral | [Mistral console](https://console.mistral.ai/api-keys) | Availability of experimental/free access is account and region dependent. |
| Together AI | [Together keys](https://api.together.ai/settings/api-keys) | Trial credits, when offered, are account-specific. |
| OpenAI | [OpenAI API keys](https://platform.openai.com/api-keys) | Do not assume a free API credit grant; API billing is separate from ChatGPT subscriptions. |
| xAI / Grok | [xAI console](https://console.x.ai/) | Usage and any promotional credits are account-specific. |
| Anthropic | [Anthropic console](https://console.anthropic.com/settings/keys) | API usage is normally billed separately from Claude consumer plans. |
| Amazon Bedrock | [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-api-keys.html) | Uses a Bedrock bearer key, AWS region, and an OpenAI-compatible runtime endpoint. Model access and billing remain AWS-account specific. |

“Free API key” does not mean unlimited generation. Free tiers change, have low rate limits, and may exclude high-quality/image models. The safest no-cost starting points for development are generally Gemini, Groq, OpenRouter free models, and Cloudflare Workers AI; verify the current quota on each linked official page before making product promises.

## Security and storage

User credentials are encrypted with AES-256-GCM in `user_ai_provider_keys`. The API returns only a masked hint. Set `AI_KEYS_ENCRYPTION_KEY` to a stable secret in every deployed API environment; rotate it only with a credential migration plan.

Preset provider endpoints cannot be changed by users. Arbitrary OpenAI-compatible endpoints are disabled by default because server-side requests can become an SSRF path. Enable them only with `AI_ALLOW_CUSTOM_BASE_URLS=true`; the current validation requires HTTPS and rejects obvious local/private hosts. For a multi-tenant public deployment, add DNS/IP resolution enforcement or an outbound proxy allowlist before enabling custom hosts.

Never put provider secrets in `VITE_*` variables, Firestore documents readable by clients, logs, analytics events, or generated project files.

## Local database

Local development uses PostgreSQL at `postgresql://postgres:postgres@localhost:5432/eazyui`, matching the repository `.env`. After installing Docker Desktop, run:

```bash
npm run db:local:up
```

The database is stored in the named Docker volume `eazyui_postgres_data`, so normal container restarts do not remove user settings. The API creates and migrates its tables automatically on first access. Use `npm run db:local:down` to stop the container without deleting its data.

## API surface

- `GET /api/models`: public catalog and defaults.
- `GET /api/ai-settings`: authenticated catalog plus masked user configuration.
- `PUT /api/ai-settings/profiles`: save Fast/Pro provider and model IDs.
- `PUT /api/ai-settings/providers/:provider`: encrypt and save a user credential.
- `DELETE /api/ai-settings/providers/:provider`: remove a user credential.

Provider adapters use the request-scoped credential first and fall back to server environment variables. Google uses its native SDK, Anthropic uses Messages API, Cloudflare uses Workers AI REST, and OpenAI, xAI, Groq, NVIDIA, OpenRouter, Together, Mistral, Bedrock, and custom endpoints use chat-completions-compatible requests.
