import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AI_PROVIDERS, DEFAULT_MODEL_PROFILES, type AiModelProfile, type AiProviderId } from '../config/aiModels.js';
import { ensurePersistenceSchema, getDbPool, queryOne, queryRows } from './postgres.js';

export interface ProviderSecretInput {
    apiKey: string;
    accountId?: string;
    region?: string;
    baseUrl?: string;
}

export interface ProviderConnectionSummary {
    provider: AiProviderId;
    configured: boolean;
    source: 'user' | 'server' | 'none';
    maskedKey?: string;
    accountId?: string;
    region?: string;
    baseUrl?: string;
    updatedAt?: string;
}

export interface UserAiSettings {
    profiles: Record<AiModelProfile, { provider: AiProviderId; model: string }>;
    providers: ProviderConnectionSummary[];
}

type RuntimeContext = { uid: string; credentials: Partial<Record<AiProviderId, ProviderSecretInput>> };
const runtimeStorage = new AsyncLocalStorage<RuntimeContext>();

function encryptionKey(): Buffer {
    const raw = String(process.env.AI_KEYS_ENCRYPTION_KEY || '').trim();
    if (!raw) throw new Error('AI_KEYS_ENCRYPTION_KEY is required before BYOK credentials can be stored.');
    return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(value: ProviderSecretInput): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value: string): ProviderSecretInput {
    const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted provider credential.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as ProviderSecretInput;
}

function maskKey(value: string): string {
    const key = String(value || '').trim();
    if (key.length < 8) return '••••••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function validateBaseUrl(raw?: string): string | undefined {
    const value = String(raw || '').trim();
    if (!value) return undefined;
    if (String(process.env.AI_ALLOW_CUSTOM_BASE_URLS || '').toLowerCase() !== 'true') {
        throw new Error('Custom OpenAI-compatible base URLs are disabled by the server administrator.');
    }
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Custom provider base URL must use HTTPS.');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname)) {
        throw new Error('Local and private-network provider URLs are not allowed.');
    }
    return url.toString().replace(/\/$/, '');
}

export async function saveProviderCredential(uid: string, provider: AiProviderId, input: ProviderSecretInput): Promise<void> {
    if (!AI_PROVIDERS[provider]) throw new Error('Unknown AI provider.');
    const apiKey = String(input.apiKey || '').trim();
    if (!apiKey) throw new Error('API key is required.');
    const normalized: ProviderSecretInput = {
        apiKey,
        ...(input.accountId?.trim() ? { accountId: input.accountId.trim() } : {}),
        ...(input.region?.trim() ? { region: input.region.trim() } : {}),
        ...(input.baseUrl ? { baseUrl: validateBaseUrl(input.baseUrl) } : {}),
    };
    if (provider === 'cloudflare' && !normalized.accountId) throw new Error('Cloudflare account ID is required.');
    if (provider === 'bedrock' && !normalized.region) normalized.region = 'us-east-1';
    const now = new Date().toISOString();
    await ensurePersistenceSchema();
    await getDbPool().query(
        `INSERT INTO user_ai_provider_keys (uid, provider, encrypted_credentials, key_hint, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (uid, provider) DO UPDATE SET encrypted_credentials=EXCLUDED.encrypted_credentials, key_hint=EXCLUDED.key_hint, updated_at=EXCLUDED.updated_at`,
        [uid, provider, encrypt(normalized), maskKey(apiKey), now],
    );
}

export async function deleteProviderCredential(uid: string, provider: AiProviderId): Promise<void> {
    await ensurePersistenceSchema();
    await getDbPool().query('DELETE FROM user_ai_provider_keys WHERE uid=$1 AND provider=$2', [uid, provider]);
}

async function loadCredentials(uid: string): Promise<Partial<Record<AiProviderId, ProviderSecretInput>>> {
    await ensurePersistenceSchema();
    const rows = await queryRows<{ provider: AiProviderId; encrypted_credentials: string }>(getDbPool(), 'SELECT provider, encrypted_credentials FROM user_ai_provider_keys WHERE uid=$1', [uid]);
    return Object.fromEntries(rows.map((row) => [row.provider, decrypt(row.encrypted_credentials)])) as Partial<Record<AiProviderId, ProviderSecretInput>>;
}

export function getRuntimeProviderCredential(provider: AiProviderId): ProviderSecretInput | undefined {
    const userCredential = runtimeStorage.getStore()?.credentials?.[provider];
    if (userCredential) return userCredential;
    const definition = AI_PROVIDERS[provider];
    const apiKey = definition.envKey ? String(process.env[definition.envKey] || '').trim() : '';
    if (!apiKey) return undefined;
    return {
        apiKey,
        ...(provider === 'cloudflare' ? { accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() } : {}),
        ...(provider === 'bedrock' ? { region: String(process.env.AWS_REGION || 'us-east-1').trim() } : {}),
        ...(provider === 'custom' ? { baseUrl: String(process.env.OPENAI_COMPATIBLE_BASE_URL || '').trim() } : {}),
    };
}

export async function runWithUserAiContext<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    return runtimeStorage.run({ uid, credentials: await loadCredentials(uid) }, fn);
}

export async function prepareUserAiRequest(uid: string, requested?: string): Promise<string> {
    const [credentials, selection] = await Promise.all([
        loadCredentials(uid),
        resolveUserRequestedModel(uid, requested),
    ]);
    runtimeStorage.enterWith({ uid, credentials });
    return `${selection.provider}:${selection.model}`;
}

export async function getUserAiSettings(uid: string): Promise<UserAiSettings> {
    await ensurePersistenceSchema();
    const [profileRow, keyRows] = await Promise.all([
        queryOne<{ fast_provider: AiProviderId; fast_model: string; quality_provider: AiProviderId; quality_model: string }>(getDbPool(), 'SELECT fast_provider, fast_model, quality_provider, quality_model FROM user_ai_model_settings WHERE uid=$1', [uid]),
        queryRows<{ provider: AiProviderId; key_hint: string; encrypted_credentials: string; updated_at: string }>(getDbPool(), 'SELECT provider, key_hint, encrypted_credentials, updated_at FROM user_ai_provider_keys WHERE uid=$1', [uid]),
    ]);
    const byProvider = new Map(keyRows.map((row) => [row.provider, row]));
    return {
        profiles: profileRow ? {
            fast: { provider: profileRow.fast_provider, model: profileRow.fast_model },
            quality: { provider: profileRow.quality_provider, model: profileRow.quality_model },
        } : DEFAULT_MODEL_PROFILES,
        providers: Object.values(AI_PROVIDERS).map((definition) => {
            const row = byProvider.get(definition.id);
            if (row) {
                const credential = decrypt(row.encrypted_credentials);
                return { provider: definition.id, configured: true, source: 'user', maskedKey: row.key_hint, accountId: credential.accountId, region: credential.region, baseUrl: credential.baseUrl, updatedAt: row.updated_at };
            }
            const configured = Boolean(definition.envKey && String(process.env[definition.envKey] || '').trim());
            return { provider: definition.id, configured, source: configured ? 'server' : 'none' };
        }),
    };
}

export async function saveUserModelProfiles(uid: string, profiles: UserAiSettings['profiles']): Promise<void> {
    for (const profile of ['fast', 'quality'] as const) {
        if (!AI_PROVIDERS[profiles[profile].provider] || !String(profiles[profile].model || '').trim()) throw new Error(`Invalid ${profile} model selection.`);
    }
    const now = new Date().toISOString();
    await ensurePersistenceSchema();
    await getDbPool().query(
        `INSERT INTO user_ai_model_settings (uid, fast_provider, fast_model, quality_provider, quality_model, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (uid) DO UPDATE SET fast_provider=EXCLUDED.fast_provider, fast_model=EXCLUDED.fast_model, quality_provider=EXCLUDED.quality_provider, quality_model=EXCLUDED.quality_model, updated_at=EXCLUDED.updated_at`,
        [uid, profiles.fast.provider, profiles.fast.model.trim(), profiles.quality.provider, profiles.quality.model.trim(), now],
    );
}

export async function resolveUserRequestedModel(uid: string, requested?: string): Promise<{ provider: AiProviderId; model: string }> {
    const value = String(requested || '').trim();
    const profile: AiModelProfile | null = value === 'profile:fast' ? 'fast' : value === 'profile:quality' ? 'quality' : null;
    if (profile) return (await getUserAiSettings(uid)).profiles[profile];
    if (value.includes(':')) {
        const split = value.indexOf(':');
        const provider = value.slice(0, split) as AiProviderId;
        if (AI_PROVIDERS[provider]) return { provider, model: value.slice(split + 1) };
    }
    const match = (await import('../config/aiModels.js')).findModel(value);
    return match ? { provider: match.provider, model: match.id } : { provider: 'gemini', model: value || DEFAULT_MODEL_PROFILES.quality.model };
}
