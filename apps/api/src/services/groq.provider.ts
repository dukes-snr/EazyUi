// ============================================================================
// Groq Provider - OpenAI-compatible endpoints (chat + whisper transcription)
// ============================================================================

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export const GROQ_MODELS = {
    'llama-3.1-8b-instant': { name: 'Llama 3.1 8B Instant', contextWindow: 131072 },
    'llama-3.3-70b-versatile': { name: 'Llama 3.3 70B Versatile', contextWindow: 131072 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { name: 'Llama 4 Scout 17B', contextWindow: 131072 },
    'qwen/qwen3-32b': { name: 'Qwen 3 32B', contextWindow: 131072 },
    'moonshotai/kimi-k2-instruct': { name: 'Kimi K2 Instruct', contextWindow: 131072 },
} as const;

export type GroqModelId = keyof typeof GROQ_MODELS;

export function isGroqModel(model?: string): model is GroqModelId {
    if (!model) return false;
    return model in GROQ_MODELS;
}

function requireGroqKey() {
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    return apiKey;
}

export async function groqChatCompletion(input: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
}): Promise<{ text: string; modelUsed: string }> {
    const apiKey = requireGroqKey();
    const model = isGroqModel(input.model) ? input.model : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');

    const response = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: input.systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: input.prompt },
            ],
            max_tokens: input.maxTokens ?? 4096,
            temperature: input.temperature ?? 0.7,
            top_p: input.topP ?? 1,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Groq chat failed (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq chat returned no text');
    return { text, modelUsed: data?.model || model };
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

