// ============================================================================
// NVIDIA Provider - OpenAI-compatible chat completions
// ============================================================================

import OpenAI from 'openai';

export const NVIDIA_MODELS = {
    'moonshotai/kimi-k2.5': { name: 'Kimi K2.5', contextWindow: 262144 },
    'qwen/qwen2.5-coder-32b-instruct': { name: 'Qwen 2.5 Coder 32B Instruct', contextWindow: 32768 },
} as const;

export type NvidiaModelId = keyof typeof NVIDIA_MODELS;

type NvidiaLastChatDebug = {
    capturedAt: string;
    attempt: number;
    model: string;
    requestBody: Record<string, unknown>;
    status: number;
    responseHeaders: Record<string, string>;
    responseBodyText: string;
};

let lastNvidiaChatDebug: NvidiaLastChatDebug | null = null;

export function getLastNvidiaChatDebug() {
    return lastNvidiaChatDebug;
}

export function isNvidiaModel(model?: string): model is NvidiaModelId {
    if (!model) return false;
    return model in NVIDIA_MODELS;
}

function requireNvidiaKey() {
    const apiKey = (process.env.NVIDIA_API_KEY || '').trim();
    if (!apiKey) throw new Error('NVIDIA_API_KEY is not configured');
    return apiKey;
}

function createNvidiaClient(apiKey: string) {
    return new OpenAI({
        apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });
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
    const content = data?.choices?.[0]?.message?.content;
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

function extractRetryDelayMs(message: string, retryAfterHeader: string | null): number {
    if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    }
    const match = message.match(/try again in\s+([\d.]+)s/i);
    if (match) {
        const seconds = Number(match[1]);
        if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    }
    return 2000;
}

export async function nvidiaChatCompletion(input: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: 'json_object';
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    maxCompletionTokens?: number;
    stop?: string[] | null;
    thinking?: boolean;
}): Promise<{ text: string; modelUsed: string; finishReason?: string }> {
    const apiKey = requireNvidiaKey();
    const model = isNvidiaModel(input.model) ? input.model : (process.env.NVIDIA_MODEL || 'moonshotai/kimi-k2.5');
    const baseMaxTokens = input.maxTokens ?? 4096;
    const client = createNvidiaClient(apiKey);

    for (let attempt = 0; attempt < 2; attempt++) {
        const requestBody = {
            model,
            messages: input.messages && input.messages.length > 0
                ? input.messages
                : [
                    { role: 'system' as const, content: input.systemPrompt || 'You are a helpful assistant.' },
                    { role: 'user' as const, content: input.prompt },
                ],
            max_tokens: typeof input.maxCompletionTokens === 'number' ? input.maxCompletionTokens : baseMaxTokens,
            temperature: input.temperature ?? 0.7,
            top_p: input.topP ?? 1,
            stream: false,
            ...(input.stop !== undefined ? { stop: input.stop } : {}),
            ...(input.responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
            chat_template_kwargs: { thinking: input.thinking ?? true },
        };

        try {
            const completion = await client.chat.completions.create(requestBody as any);
            const data = completion as any;
            const responseBodyText = JSON.stringify(data);

            lastNvidiaChatDebug = {
                capturedAt: new Date().toISOString(),
                attempt: attempt + 1,
                model,
                requestBody,
                status: 200,
                responseHeaders: {},
                responseBodyText,
            };

            const text = extractText(data);
            if (!text) {
                const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
                throw new Error(`NVIDIA chat returned no text (finish_reason: ${finishReason})`);
            }

            return {
                text,
                modelUsed: data?.model || model,
                finishReason: data?.choices?.[0]?.finish_reason,
            };
        } catch (error: any) {
            const status = Number(error?.status || error?.response?.status || 500);
            const errorData = error?.error || error?.response?.data || {};
            const message = errorData?.message || error?.message || 'Unknown error';
            const responseHeaders = error?.headers || error?.response?.headers || {};

            lastNvidiaChatDebug = {
                capturedAt: new Date().toISOString(),
                attempt: attempt + 1,
                model,
                requestBody,
                status,
                responseHeaders: typeof responseHeaders === 'object' && responseHeaders !== null ? responseHeaders : {},
                responseBodyText: JSON.stringify(errorData || { message }),
            };

            const isRateLimited = status === 429 || /rate limit/i.test(String(message));
            if (isRateLimited && attempt === 0) {
                const retryAfterHeader = responseHeaders?.['retry-after'] ?? responseHeaders?.['Retry-After'] ?? null;
                const retryDelay = Math.min(extractRetryDelayMs(String(message), retryAfterHeader), 25000);
                await sleep(retryDelay + 250);
                continue;
            }
            throw new Error(`NVIDIA chat failed (${status}): ${message}`);
        }
    }

    throw new Error('NVIDIA chat failed after retry');
}
