// ============================================================================
// Cloudflare Worker AI Provider
// https://developers.cloudflare.com/workers-ai/
// ============================================================================

import type { TokenUsageEntry } from './tokenUsage.js';
import { getRuntimeProviderCredential } from './aiProviderSettings.js';

export const CLOUDFLARE_MODELS = {
    '@cf/meta/llama-3-8b-instruct': { name: 'Llama 3 8B Instruct', contextWindow: 8192, maxOutputTokens: 4096 },
    '@cf/meta/llama-3-8b-instruct-awq': { name: 'Llama 3 8B Instruct (AWQ)', contextWindow: 8192, maxOutputTokens: 4096 },
    '@cf/meta/llama-3.1-8b-instruct': { name: 'Llama 3.1 8B Instruct', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/meta/llama-3.1-8b-instruct-awq': { name: 'Llama 3.1 8B Instruct (AWQ)', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/meta/llama-3.1-8b-instruct-fp8': { name: 'Llama 3.1 8B Instruct (FP8)', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/meta/llama-3.3-70b-instruct': { name: 'Llama 3.3 70B Instruct', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { name: 'Llama 3.3 70B Instruct Fast (FP8)', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': { name: 'DeepSeek R1 Distill Qwen 32B', contextWindow: 131072, maxOutputTokens: 4096 },
    '@cf/mistral/mistral-7b-instruct-v0.1': { name: 'Mistral 7B Instruct v0.1', contextWindow: 8192, maxOutputTokens: 4096 },
    '@cf/mistral/mistral-7b-instruct-v0.2': { name: 'Mistral 7B Instruct v0.2', contextWindow: 8192, maxOutputTokens: 4096 },
    '@cf/google/gemma-2b-it': { name: 'Gemma 2B IT', contextWindow: 8192, maxOutputTokens: 4096 },
    '@cf/google/gemma-7b-it': { name: 'Gemma 7B IT', contextWindow: 8192, maxOutputTokens: 4096 },
} as const;

export type CloudflareModelId = keyof typeof CLOUDFLARE_MODELS;

type CloudflareLastChatDebug = {
    capturedAt: string;
    attempt: number;
    model: string;
    requestBody: Record<string, unknown>;
    status: number;
    responseHeaders: Record<string, string>;
    responseBodyText: string;
};

let lastCloudflareChatDebug: CloudflareLastChatDebug | null = null;

export function getLastCloudflareChatDebug() {
    return lastCloudflareChatDebug;
}

export function isCloudflareModel(model?: string): model is CloudflareModelId {
    if (!model) return false;
    return model in CLOUDFLARE_MODELS;
}

function requireCloudflareConfig() {
    const credential = getRuntimeProviderCredential('cloudflare');
    const accountId = credential?.accountId || '';
    const apiToken = credential?.apiKey || '';
    if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not configured');
    if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is not configured');
    return { accountId, apiToken };
}

function resolveCloudflareBaseUrl(accountId: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
}

function resolveMaxOutputTokens(model: string): number {
    return CLOUDFLARE_MODELS[model as CloudflareModelId]?.maxOutputTokens || 4096;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonSafe(text: string): any {
    try {
        return JSON.parse(text || '{}');
    } catch {
        return {};
    }
}

function extractText(data: any): string {
    // Legacy Workers AI text-generation shape: result.response
    const legacy = data?.result?.response;
    if (typeof legacy === 'string') return legacy.trim();

    // OpenAI-compatible chat shape: result.choices[0].message.content
    const content = data?.result?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part: any) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                return '';
            })
            .join('')
            .trim();
    }
    return '';
}

function extractFinishReason(data: any): string | undefined {
    return data?.result?.choices?.[0]?.finish_reason;
}

function toNonNegativeInt(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
}

function parseCloudflareUsage(data: any, model: string): TokenUsageEntry | undefined {
    const usage = data?.result?.usage;
    if (!usage || typeof usage !== 'object') return undefined;
    const inputTokens = toNonNegativeInt(usage?.prompt_tokens ?? usage?.input_tokens);
    const outputTokens = toNonNegativeInt(usage?.completion_tokens ?? usage?.output_tokens);
    const totalFromPayload = toNonNegativeInt(usage?.total_tokens);
    const totalTokens = totalFromPayload > 0 ? totalFromPayload : inputTokens + outputTokens;
    if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return undefined;
    return {
        provider: 'cloudflare',
        model: String(data?.result?.model || model || '').trim(),
        inputTokens,
        outputTokens,
        totalTokens,
    };
}

function buildMessages(input: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}): Array<{ role: string; content: string }> {
    if (input.messages && input.messages.length > 0) {
        return input.messages.map((m) => ({ role: m.role, content: m.content }));
    }
    return [
        { role: 'system', content: input.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: input.prompt },
    ];
}

export async function cloudflareChatCompletion(input: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    maxCompletionTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: 'json_object';
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    stop?: string[] | null;
}): Promise<{ text: string; modelUsed: string; finishReason?: string; usage?: TokenUsageEntry }> {
    const { accountId, apiToken } = requireCloudflareConfig();
    const model = isCloudflareModel(input.model) ? input.model : (process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3-8b-instruct');
    const maxOutputTokens = resolveMaxOutputTokens(model);
    const baseMaxTokens = Math.min(input.maxTokens ?? maxOutputTokens, maxOutputTokens);
    const messages = buildMessages(input);
    const url = `${resolveCloudflareBaseUrl(accountId)}/${model}`;

    const buildBody = (includeResponseFormat: boolean): Record<string, unknown> => ({
        messages,
        max_tokens: Math.min(
            typeof input.maxCompletionTokens === 'number' ? input.maxCompletionTokens : baseMaxTokens,
            maxOutputTokens
        ),
        temperature: input.temperature ?? 0.7,
        top_p: input.topP ?? 1,
        ...(input.stop !== undefined ? { stop: input.stop } : {}),
        ...(includeResponseFormat && input.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
    });

    for (let attempt = 0; attempt < 2; attempt++) {
        const requestBody = buildBody(attempt === 0);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiToken}`,
                },
                body: JSON.stringify(requestBody),
            });

            const responseBodyText = await response.text();
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            lastCloudflareChatDebug = {
                capturedAt: new Date().toISOString(),
                attempt: attempt + 1,
                model,
                requestBody,
                status: response.status,
                responseHeaders,
                responseBodyText,
            };

            if (!response.ok) {
                const errorData = parseJsonSafe(responseBodyText);
                const message = errorData?.errors?.[0]?.message
                    || errorData?.result?.message
                    || errorData?.message
                    || 'Unknown error';
                const isRateLimited = response.status === 429 || /rate limit/i.test(String(message));
                if (isRateLimited && attempt === 0) {
                    await sleep(2000);
                    continue;
                }
                throw new Error(`Cloudflare AI chat failed (${response.status}): ${message}`);
            }

            const data = parseJsonSafe(responseBodyText);
            const text = extractText(data);
            if (!text) {
                const finishReason = extractFinishReason(data) || 'unknown';
                throw new Error(`Cloudflare AI chat returned no text (finish_reason: ${finishReason})`);
            }

            return {
                text,
                modelUsed: data?.result?.model || model,
                finishReason: extractFinishReason(data),
                usage: parseCloudflareUsage(data, model),
            };
        } catch (error: any) {
            const status = Number(error?.status || error?.response?.status || 500);
            const message = error?.message || 'Unknown error';

            lastCloudflareChatDebug = {
                capturedAt: new Date().toISOString(),
                attempt: attempt + 1,
                model,
                requestBody,
                status,
                responseHeaders: {},
                responseBodyText: JSON.stringify({ message }),
            };

            // If strict JSON mode failed, retry once without response_format.
            const isStrictJsonFailure =
                input.responseFormat === 'json_object' &&
                attempt === 0 &&
                (/json/i.test(String(message)) || /failed to generate/i.test(String(message)));
            if (isStrictJsonFailure) {
                await sleep(200);
                continue;
            }
            throw error;
        }
    }

    throw new Error('Cloudflare AI chat failed after retry');
}
