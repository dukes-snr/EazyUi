export type AiProviderId =
    | 'gemini'
    | 'openai'
    | 'xai'
    | 'groq'
    | 'nvidia'
    | 'openrouter'
    | 'together'
    | 'mistral'
    | 'anthropic'
    | 'cloudflare'
    | 'bedrock'
    | 'custom';

export type AiModelStatus = 'active' | 'available' | 'disabled';
export type AiModelProfile = 'fast' | 'quality';
export type AiTaskModelRole = 'overseer' | 'plannerFast' | 'plannerQuality' | 'visionRouter';

export interface AiProviderDefinition {
    id: AiProviderId;
    name: string;
    protocol: 'gemini' | 'openai' | 'anthropic' | 'cloudflare';
    baseUrl?: string;
    envKey?: string;
    keyUrl: string;
    docsUrl: string;
    freeAccess: 'free-tier' | 'trial' | 'paid' | 'varies';
    supportsCustomBaseUrl?: boolean;
    extraFields?: Array<'accountId' | 'region' | 'baseUrl'>;
}

export interface AiModelDefinition {
    id: string;
    provider: AiProviderId;
    name: string;
    status: AiModelStatus;
    profiles: AiModelProfile[];
    supportsImages?: boolean;
    contextWindow?: number;
    maxOutputTokens?: number;
    lifecycle?: 'production' | 'preview' | 'system' | 'audio' | 'safety';
    speedTokensPerSecond?: number;
    inputPricePerMillionUsd?: number;
    outputPricePerMillionUsd?: number;
    recommendedForHtml?: 'fast' | 'quality' | false;
    notes?: string;
}

/**
 * The single source of truth for model/provider availability.
 *
 * `active`    = used by a default profile.
 * `available` = selectable when the provider is configured or the user adds a key.
 * `disabled`  = retained for quick restoration, but never selected automatically.
 */
export const AI_PROVIDERS: Record<AiProviderId, AiProviderDefinition> = {
    gemini: { id: 'gemini', name: 'Google Gemini', protocol: 'gemini', envKey: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/app/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key', freeAccess: 'free-tier' },
    openai: { id: 'openai', name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', envKey: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', docsUrl: 'https://developers.openai.com/api/docs/quickstart', freeAccess: 'paid' },
    xai: { id: 'xai', name: 'xAI (Grok)', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', envKey: 'XAI_API_KEY', keyUrl: 'https://console.x.ai/', docsUrl: 'https://docs.x.ai/docs/overview', freeAccess: 'varies' },
    groq: { id: 'groq', name: 'Groq', protocol: 'openai', baseUrl: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY', keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/quickstart', freeAccess: 'free-tier' },
    nvidia: { id: 'nvidia', name: 'NVIDIA NIM', protocol: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', envKey: 'NVIDIA_API_KEY', keyUrl: 'https://build.nvidia.com/', docsUrl: 'https://docs.api.nvidia.com/nim/reference', freeAccess: 'trial' },
    openrouter: { id: 'openrouter', name: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/docs/quickstart', freeAccess: 'free-tier' },
    together: { id: 'together', name: 'Together AI', protocol: 'openai', baseUrl: 'https://api.together.xyz/v1', envKey: 'TOGETHER_API_KEY', keyUrl: 'https://api.together.ai/settings/api-keys', docsUrl: 'https://docs.together.ai/docs/quickstart', freeAccess: 'trial' },
    mistral: { id: 'mistral', name: 'Mistral AI', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1', envKey: 'MISTRAL_API_KEY', keyUrl: 'https://console.mistral.ai/api-keys', docsUrl: 'https://docs.mistral.ai/getting-started/quickstart/', freeAccess: 'varies' },
    anthropic: { id: 'anthropic', name: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', envKey: 'ANTHROPIC_API_KEY', keyUrl: 'https://console.anthropic.com/settings/keys', docsUrl: 'https://docs.anthropic.com/en/api/getting-started', freeAccess: 'paid' },
    cloudflare: { id: 'cloudflare', name: 'Cloudflare Workers AI', protocol: 'cloudflare', envKey: 'CLOUDFLARE_API_TOKEN', keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', docsUrl: 'https://developers.cloudflare.com/workers-ai/get-started/rest-api/', freeAccess: 'free-tier', extraFields: ['accountId'] },
    bedrock: { id: 'bedrock', name: 'Amazon Bedrock', protocol: 'openai', envKey: 'AWS_BEARER_TOKEN_BEDROCK', keyUrl: 'https://console.aws.amazon.com/bedrock/home#/api-keys', docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-api-keys.html', freeAccess: 'varies', extraFields: ['region'] },
    custom: { id: 'custom', name: 'Custom OpenAI-compatible', protocol: 'openai', keyUrl: '', docsUrl: '', freeAccess: 'varies', supportsCustomBaseUrl: true, extraFields: ['baseUrl'] },
};

export const AI_MODELS: readonly AiModelDefinition[] = [
    { id: 'gemini-2.5-flash', provider: 'gemini', name: 'Gemini 2.5 Flash', status: 'active', profiles: ['fast'], supportsImages: true },
    { id: 'gemini-2.5-pro', provider: 'gemini', name: 'Gemini 2.5 Pro', status: 'available', profiles: ['quality'], supportsImages: true },
    { id: 'gemini-3-pro-preview', provider: 'gemini', name: 'Gemini 3 Pro Preview', status: 'disabled', profiles: ['quality'], supportsImages: true, notes: 'Previously used Pro model; retained for quick restoration.' },
    { id: 'openai/gpt-oss-120b', provider: 'groq', name: 'GPT OSS 120B', status: 'available', profiles: ['quality'], lifecycle: 'production', speedTokensPerSecond: 500, contextWindow: 131072, maxOutputTokens: 65536, inputPricePerMillionUsd: 0.15, outputPricePerMillionUsd: 0.60, recommendedForHtml: 'quality', notes: 'Best Groq Pro choice for structured HTML: strong reasoning/code quality with a large completion budget.' },
    { id: 'openai/gpt-oss-20b', provider: 'groq', name: 'GPT OSS 20B', status: 'available', profiles: ['fast'], lifecycle: 'production', speedTokensPerSecond: 1000, contextWindow: 131072, maxOutputTokens: 65536, inputPricePerMillionUsd: 0.075, outputPricePerMillionUsd: 0.30, recommendedForHtml: 'fast', notes: 'Best Groq Fast choice: highest text speed with enough output capacity for complete HTML.' },
    { id: 'llama-3.1-8b-instant', provider: 'groq', name: 'Llama 3.1 8B Instant', status: 'available', profiles: ['fast'], lifecycle: 'production', speedTokensPerSecond: 560, contextWindow: 131072, maxOutputTokens: 131072, inputPricePerMillionUsd: 0.05, outputPricePerMillionUsd: 0.08, notes: 'Cheapest production fallback, but less reliable for complex multi-section HTML.' },
    { id: 'llama-3.3-70b-versatile', provider: 'groq', name: 'Llama 3.3 70B Versatile', status: 'available', profiles: ['quality'], lifecycle: 'production', speedTokensPerSecond: 280, contextWindow: 131072, maxOutputTokens: 32768, inputPricePerMillionUsd: 0.59, outputPricePerMillionUsd: 0.79, notes: 'Stable production quality fallback when GPT OSS behavior is unsuitable.' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', name: 'Llama 4 Scout 17B', status: 'available', profiles: ['fast'], lifecycle: 'preview', speedTokensPerSecond: 750, contextWindow: 131072, maxOutputTokens: 8192, inputPricePerMillionUsd: 0.11, outputPricePerMillionUsd: 0.34, supportsImages: true, notes: 'Use for reference-image routing and visual analysis; preview status and 8K output make it unsuitable as the main HTML generator.' },
    { id: 'qwen/qwen3-32b', provider: 'groq', name: 'Qwen 3 32B', status: 'available', profiles: ['quality'], lifecycle: 'preview', speedTokensPerSecond: 400, contextWindow: 131072, maxOutputTokens: 40960, inputPricePerMillionUsd: 0.29, outputPricePerMillionUsd: 0.59, notes: 'Promising code-generation alternative, but preview models should not be production defaults.' },
    { id: 'qwen/qwen3.6-27b', provider: 'groq', name: 'Qwen 3.6 27B', status: 'available', profiles: ['quality'], lifecycle: 'preview', speedTokensPerSecond: 500, contextWindow: 131072, maxOutputTokens: 32768, inputPricePerMillionUsd: 0.60, outputPricePerMillionUsd: 3.00, supportsImages: true, notes: 'Preview multimodal option; output pricing is high relative to other Groq choices.' },
    { id: 'groq/compound', provider: 'groq', name: 'Groq Compound', status: 'disabled', profiles: [], lifecycle: 'system', speedTokensPerSecond: 450, contextWindow: 131072, maxOutputTokens: 8192, recommendedForHtml: false, notes: 'Agentic web/code system; tool behavior and 8K output are a poor fit for deterministic HTML JSON.' },
    { id: 'groq/compound-mini', provider: 'groq', name: 'Groq Compound Mini', status: 'disabled', profiles: [], lifecycle: 'system', speedTokensPerSecond: 450, contextWindow: 131072, maxOutputTokens: 8192, recommendedForHtml: false, notes: 'Agentic system; keep out of Fast/Pro HTML routing.' },
    { id: 'whisper-large-v3', provider: 'groq', name: 'Whisper Large V3', status: 'disabled', profiles: [], lifecycle: 'audio', recommendedForHtml: false, notes: 'Audio transcription model; available through the transcription route.' },
    { id: 'whisper-large-v3-turbo', provider: 'groq', name: 'Whisper Large V3 Turbo', status: 'disabled', profiles: [], lifecycle: 'audio', recommendedForHtml: false, notes: 'Fast audio transcription model; available through the transcription route.' },
    { id: 'canopylabs/orpheus-arabic-saudi', provider: 'groq', name: 'Orpheus Arabic Saudi', status: 'disabled', profiles: [], lifecycle: 'audio', recommendedForHtml: false, notes: 'Preview speech-generation model.' },
    { id: 'canopylabs/orpheus-v1-english', provider: 'groq', name: 'Orpheus V1 English', status: 'disabled', profiles: [], lifecycle: 'audio', recommendedForHtml: false, notes: 'Preview speech-generation model.' },
    { id: 'meta-llama/llama-prompt-guard-2-22m', provider: 'groq', name: 'Llama Prompt Guard 2 22M', status: 'disabled', profiles: [], lifecycle: 'safety', recommendedForHtml: false, notes: 'Prompt-safety classifier, not a generator.' },
    { id: 'meta-llama/llama-prompt-guard-2-86m', provider: 'groq', name: 'Llama Prompt Guard 2 86M', status: 'disabled', profiles: [], lifecycle: 'safety', recommendedForHtml: false, notes: 'Prompt-safety classifier, not a generator.' },
    { id: 'openai/gpt-oss-safeguard-20b', provider: 'groq', name: 'Safety GPT OSS 20B', status: 'disabled', profiles: [], lifecycle: 'safety', recommendedForHtml: false, notes: 'Safety policy model, not a design generator.' },
    { id: 'moonshotai/kimi-k2.6', provider: 'nvidia', name: 'Kimi K2.6', status: 'active', profiles: ['quality'], maxOutputTokens: 16384 },
    { id: 'minimaxai/minimax-m3', provider: 'nvidia', name: 'MiniMax M3', status: 'available', profiles: ['quality'] },
    { id: 'moonshotai/kimi-k2.5', provider: 'nvidia', name: 'Kimi K2.5', status: 'disabled', profiles: ['quality'] },
    { id: 'grok-4-fast-reasoning', provider: 'xai', name: 'Grok Fast', status: 'available', profiles: ['fast'] },
    { id: 'grok-4', provider: 'xai', name: 'Grok 4', status: 'available', profiles: ['quality'] },
    { id: 'gpt-5.4-mini', provider: 'openai', name: 'GPT-5.4 mini', status: 'available', profiles: ['fast'], supportsImages: true },
    { id: 'gpt-5.5', provider: 'openai', name: 'GPT-5.5', status: 'available', profiles: ['quality'], supportsImages: true },
    { id: 'gpt-5.5-pro', provider: 'openai', name: 'GPT-5.5 Pro', status: 'available', profiles: ['quality'], supportsImages: true },
    { id: 'gpt-5.4', provider: 'openai', name: 'GPT-5.4', status: 'available', profiles: ['quality'], supportsImages: true, notes: 'Previous default; retained for existing integrations.' },
    { id: 'openai/gpt-oss-20b:free', provider: 'openrouter', name: 'GPT OSS 20B (free)', status: 'available', profiles: ['fast'] },
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', provider: 'together', name: 'Llama 3.3 70B Turbo', status: 'available', profiles: ['quality'] },
    { id: 'mistral-small-latest', provider: 'mistral', name: 'Mistral Small', status: 'available', profiles: ['fast'] },
    { id: 'mistral-large-latest', provider: 'mistral', name: 'Mistral Large', status: 'available', profiles: ['quality'] },
    { id: 'claude-sonnet-4-5', provider: 'anthropic', name: 'Claude Sonnet', status: 'available', profiles: ['quality'], supportsImages: true },
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', provider: 'cloudflare', name: 'Llama 3.3 70B Fast', status: 'available', profiles: ['fast'] },
];

export const DEFAULT_MODEL_PROFILES: Record<AiModelProfile, { provider: AiProviderId; model: string }> = {
    fast: { provider: 'gemini', model: 'gemini-2.5-flash' },
    quality: { provider: 'nvidia', model: 'moonshotai/kimi-k2.6' },
};

/** Server-owned task routing. Change these defaults here; use env vars only for deployment overrides. */
export const AI_TASK_MODEL_DEFAULTS: Record<AiTaskModelRole, { provider: AiProviderId; model: string; envOverride: string }> = {
    overseer: { provider: 'groq', model: 'openai/gpt-oss-20b', envOverride: 'OVERSEER_MODEL' },
    plannerFast: { provider: 'groq', model: 'openai/gpt-oss-20b', envOverride: 'GROQ_PLANNER_FAST_MODEL' },
    plannerQuality: { provider: 'groq', model: 'openai/gpt-oss-120b', envOverride: 'GROQ_PLANNER_QUALITY_MODEL' },
    visionRouter: { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct', envOverride: 'GROQ_VISION_MODEL' },
};

export function resolveTaskModel(role: AiTaskModelRole): string {
    const definition = AI_TASK_MODEL_DEFAULTS[role];
    return String(process.env[definition.envOverride] || definition.model).trim() || definition.model;
}

export function findModel(modelId?: string, providerId?: AiProviderId): AiModelDefinition | undefined {
    const requested = String(modelId || '').trim();
    if (!requested) return undefined;
    return AI_MODELS.find((model) => model.id === requested && (!providerId || model.provider === providerId));
}

export function publicAiCatalog() {
    return {
        defaults: DEFAULT_MODEL_PROFILES,
        taskDefaults: AI_TASK_MODEL_DEFAULTS,
        providers: Object.values(AI_PROVIDERS).map(({ envKey: _envKey, ...provider }) => provider),
        models: AI_MODELS,
    };
}
