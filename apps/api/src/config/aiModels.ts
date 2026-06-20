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
    { id: 'llama-3.1-8b-instant', provider: 'groq', name: 'Llama 3.1 8B Instant', status: 'available', profiles: ['fast'] },
    { id: 'llama-3.3-70b-versatile', provider: 'groq', name: 'Llama 3.3 70B Versatile', status: 'available', profiles: ['quality'] },
    { id: 'openai/gpt-oss-120b', provider: 'groq', name: 'GPT OSS 120B', status: 'available', profiles: ['quality'] },
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

export function findModel(modelId?: string, providerId?: AiProviderId): AiModelDefinition | undefined {
    const requested = String(modelId || '').trim();
    if (!requested) return undefined;
    return AI_MODELS.find((model) => model.id === requested && (!providerId || model.provider === providerId));
}

export function publicAiCatalog() {
    return {
        defaults: DEFAULT_MODEL_PROFILES,
        providers: Object.values(AI_PROVIDERS).map(({ envKey: _envKey, ...provider }) => provider),
        models: AI_MODELS,
    };
}
