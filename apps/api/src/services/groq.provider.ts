// ============================================================================
// Groq Provider - OpenAI-compatible endpoints (chat + whisper transcription)
// ============================================================================

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export const GROQ_MODELS = {
    'moonshotai/kimi-k2-instruct-0905': { name: 'Kimi K2 Instruct 0905', contextWindow: 131072 },
    'openai/gpt-oss-120b': { name: 'GPT OSS 120B', contextWindow: 131072 },
    'llama-3.1-8b-instant': { name: 'Llama 3.1 8B Instant', contextWindow: 131072 },
    'llama-3.3-70b-versatile': { name: 'Llama 3.3 70B Versatile', contextWindow: 131072 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { name: 'Llama 4 Scout 17B', contextWindow: 131072 },
    'meta-llama/llama-4-maverick-17b-128e-instruct': { name: 'Llama 4 Maverick 17B', contextWindow: 131072 },
    'qwen/qwen3-32b': { name: 'Qwen 3 32B', contextWindow: 131072 },
    'moonshotai/kimi-k2-instruct': { name: 'Kimi K2 Instruct', contextWindow: 131072 },
} as const;

export type GroqModelId = keyof typeof GROQ_MODELS;

type GroqLastChatDebug = {
    capturedAt: string;
    attempt: number;
    model: string;
    requestBody: {
        model: string;
        messages: Array<{
            role: 'system' | 'user' | 'assistant';
            content:
                | string
                | Array<
                    | { type: 'text'; text: string }
                    | { type: 'image_url'; image_url: { url: string } }
                >;
        }>;
        max_tokens: number;
        temperature: number;
        top_p: number;
    };
    status: number;
    responseHeaders: Record<string, string>;
    responseBodyText: string;
};

let lastGroqChatDebug: GroqLastChatDebug | null = null;

export function getLastGroqChatDebug() {
    return lastGroqChatDebug;
}

export function isGroqModel(model?: string): model is GroqModelId {
    if (!model) return false;
    return model in GROQ_MODELS;
}

function requireGroqKey() {
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    return apiKey;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGroqText(data: any): string {
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
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.round(seconds * 1000);
        }
    }
    const match = message.match(/try again in\s+([\d.]+)s/i);
    if (match) {
        const seconds = Number(match[1]);
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.round(seconds * 1000);
        }
    }
    return 2000;
}

function parseJsonSafe(text: string): any {
    try {
        return JSON.parse(text || '{}');
    } catch {
        return {};
    }
}

function supportsReasoningEffort(model: string): boolean {
    // Kimi rejects reasoning_effort in Groq API.
    if (model.startsWith('moonshotai/')) return false;
    return true;
}

export async function groqChatCompletion(input: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: 'json_object';
    messages?: Array<{
        role: 'system' | 'user' | 'assistant';
        content:
            | string
            | Array<
                | { type: 'text'; text: string }
                | { type: 'image_url'; image_url: { url: string } }
            >;
    }>;
    maxCompletionTokens?: number;
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
    stop?: string[] | null;
}): Promise<{ text: string; modelUsed: string; finishReason?: string }> {
    const apiKey = requireGroqKey();
    const model = isGroqModel(input.model) ? input.model : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
    const baseMaxTokens = input.maxTokens ?? 4096;

    for (let attempt = 0; attempt < 2; attempt++) {
        const maxTokens = attempt === 0 ? baseMaxTokens : Math.max(900, Math.floor(baseMaxTokens * 0.6));
        const tryBodies: any[] = [
            {
                model,
                messages: input.messages && input.messages.length > 0
                    ? input.messages
                    : [
                        { role: 'system' as const, content: input.systemPrompt || 'You are a helpful assistant.' },
                        { role: 'user' as const, content: input.prompt },
                    ],
                ...(typeof input.maxCompletionTokens === 'number'
                    ? { max_completion_tokens: input.maxCompletionTokens }
                    : { max_tokens: maxTokens }),
                temperature: input.temperature ?? 0.7,
                top_p: input.topP ?? 1,
                ...(input.reasoningEffort && supportsReasoningEffort(model) ? { reasoning_effort: input.reasoningEffort } : {}),
                ...(input.stop !== undefined ? { stop: input.stop } : {}),
                ...(input.responseFormat === 'json_object'
                    ? { response_format: { type: 'json_object' as const } }
                    : {}),
            },
            {
                model,
                messages: input.messages && input.messages.length > 0
                    ? input.messages
                    : [
                        { role: 'system' as const, content: input.systemPrompt || 'You are a helpful assistant.' },
                        { role: 'user' as const, content: input.prompt },
                    ],
                ...(typeof input.maxCompletionTokens === 'number'
                    ? { max_completion_tokens: Math.max(900, Math.floor(input.maxCompletionTokens * 0.7)) }
                    : { max_tokens: Math.max(700, Math.floor(maxTokens * 0.85)) }),
                temperature: Math.min(input.temperature ?? 0.7, 0.4),
                top_p: input.topP ?? 1,
                ...(input.reasoningEffort && supportsReasoningEffort(model) ? { reasoning_effort: input.reasoningEffort } : {}),
                ...(input.stop !== undefined ? { stop: input.stop } : {}),
            },
        ];

        for (let bodyAttempt = 0; bodyAttempt < tryBodies.length; bodyAttempt++) {
            const requestBody = tryBodies[bodyAttempt];
            // Only do the "no response_format" fallback when strict JSON mode was requested.
            if (bodyAttempt === 1 && input.responseFormat !== 'json_object') break;
            const response = await fetch(GROQ_CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
            });
            const responseBodyText = await response.text();
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            lastGroqChatDebug = {
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
                const message = errorData.error?.message || 'Unknown error';
                const isRateLimited = response.status === 429 || /rate limit/i.test(String(message));
                if (isRateLimited && attempt === 0) {
                    const retryDelay = Math.min(extractRetryDelayMs(String(message), response.headers.get('retry-after')) + 250, 25000);
                    await sleep(retryDelay);
                    continue;
                }

                // If strict JSON mode failed, retry once without response_format.
                const isStrictJsonFailure =
                    response.status === 400 &&
                    input.responseFormat === 'json_object' &&
                    (/failed to generate json/i.test(String(message)) ||
                        /failed to validate json/i.test(String(message)) ||
                        /json_validate_failed/i.test(String(errorData?.error?.code || '')));
                if (isStrictJsonFailure && bodyAttempt === 0) {
                    await sleep(200);
                    continue;
                }

                throw new Error(`Groq chat failed (${response.status}): ${message}`);
            }

            const data = parseJsonSafe(responseBodyText);
            const text = extractGroqText(data);
            if (text) {
                return {
                    text,
                    modelUsed: data?.model || model,
                    finishReason: data?.choices?.[0]?.finish_reason,
                };
            }
            if (attempt === 0) {
                await sleep(500);
                continue;
            }
            const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
            throw new Error(`Groq chat returned no text (finish_reason: ${finishReason})`);
        }
    }

    throw new Error('Groq chat failed after retry');
}

export async function groqWhisperTranscription(input: {
    audioBase64: string;
    mimeType: string;
    language?: string;
    model?: string;
}): Promise<{ text: string; modelUsed: string }> {
    const apiKey = requireGroqKey();
    const model = (input.model || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo').trim();
    const bytes = Buffer.from(input.audioBase64, 'base64');
    const fileExt = input.mimeType.includes('webm') ? 'webm' : input.mimeType.includes('ogg') ? 'ogg' : input.mimeType.includes('mp4') ? 'mp4' : 'wav';

    const form = new FormData();
    form.append('model', model);
    if (input.language?.trim()) form.append('language', input.language.trim());
    form.append('response_format', 'json');
    form.append('file', new Blob([bytes], { type: input.mimeType }), `recording.${fileExt}`);

    const response = await fetch(GROQ_TRANSCRIBE_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        body: form,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Groq transcription failed (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const text = (data?.text || '').trim();
    if (!text) throw new Error('Groq transcription returned empty text');
    return { text, modelUsed: model };
}
