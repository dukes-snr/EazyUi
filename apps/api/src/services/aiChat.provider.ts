import { AI_PROVIDERS, type AiProviderId } from '../config/aiModels.js';
import { getRuntimeProviderCredential } from './aiProviderSettings.js';
import { cloudflareChatCompletion } from './cloudflare.provider.js';
import { groqChatCompletion } from './groq.provider.js';
import { nvidiaChatCompletion } from './nvidia.provider.js';
import type { TokenUsageEntry } from './tokenUsage.js';

export interface AiModelRef { provider: AiProviderId; model: string }

export function parseAiModelRef(value?: string): AiModelRef | null {
    const raw = String(value || '').trim();
    const separator = raw.indexOf(':');
    if (separator <= 0) return null;
    const provider = raw.slice(0, separator) as AiProviderId;
    if (!AI_PROVIDERS[provider]) return null;
    return { provider, model: raw.slice(separator + 1) };
}

export function isExternalTextModel(value?: string): boolean {
    const ref = parseAiModelRef(value);
    return Boolean(ref && ref.provider !== 'gemini');
}

type ChatInput = {
    model: string;
    systemPrompt?: string;
    prompt: string;
    maxTokens?: number;
    maxCompletionTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: 'json_object';
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: any }>;
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
    stop?: string[] | null;
    thinking?: boolean;
};

export type ChatOutput = { text: string; modelUsed: string; finishReason?: string; usage?: TokenUsageEntry };

function nonNegative(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function usage(data: any, provider: AiProviderId, model: string): TokenUsageEntry | undefined {
    const raw = data?.usage;
    if (!raw) return undefined;
    const inputTokens = nonNegative(raw.prompt_tokens ?? raw.input_tokens);
    const outputTokens = nonNegative(raw.completion_tokens ?? raw.output_tokens);
    const totalTokens = nonNegative(raw.total_tokens) || inputTokens + outputTokens;
    if (!totalTokens) return undefined;
    return { provider, model: String(data?.model || model), inputTokens, outputTokens, totalTokens, cachedInputTokens: nonNegative(raw?.prompt_tokens_details?.cached_tokens) || undefined };
}

function contentText(content: any): string {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    return content.map((part) => typeof part === 'string' ? part : String(part?.text || '')).join('').trim();
}

function bedrockBaseUrl(region: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`;
}

async function openAiCompatibleCompletion(provider: AiProviderId, input: ChatInput): Promise<ChatOutput> {
    const credential = getRuntimeProviderCredential(provider);
    if (!credential?.apiKey) throw new Error(`${AI_PROVIDERS[provider].name} API key is not configured.`);
    const definition = AI_PROVIDERS[provider];
    const baseUrl = provider === 'bedrock'
        ? bedrockBaseUrl(credential.region || 'us-east-1')
        : credential.baseUrl || definition.baseUrl;
    if (!baseUrl) throw new Error(`${definition.name} base URL is not configured.`);
    const messages = input.messages?.length ? input.messages : [
        { role: 'system', content: input.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: input.prompt },
    ];
    const body: Record<string, unknown> = {
        model: input.model,
        messages,
        temperature: input.temperature ?? 0.7,
        top_p: input.topP ?? 1,
        max_tokens: input.maxCompletionTokens ?? input.maxTokens ?? 4096,
        ...(input.stop !== undefined ? { stop: input.stop } : {}),
        ...(input.responseFormat ? { response_format: { type: input.responseFormat } } : {}),
    };
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.apiKey}` },
        body: JSON.stringify(body),
    });
    const rawText = await response.text();
    let data: any = {};
    try { data = JSON.parse(rawText); } catch { /* handled below */ }
    if (!response.ok) throw new Error(`${definition.name} chat failed (${response.status}): ${data?.error?.message || rawText.slice(0, 300) || 'Unknown error'}`);
    const text = contentText(data?.choices?.[0]?.message?.content);
    if (!text) throw new Error(`${definition.name} returned no text.`);
    return { text, modelUsed: data?.model || input.model, finishReason: data?.choices?.[0]?.finish_reason, usage: usage(data, provider, input.model) };
}

async function anthropicCompletion(input: ChatInput): Promise<ChatOutput> {
    const credential = getRuntimeProviderCredential('anthropic');
    if (!credential?.apiKey) throw new Error('Anthropic API key is not configured.');
    const messages = (input.messages?.length ? input.messages : [{ role: 'user', content: input.prompt }])
        .filter((message) => message.role !== 'system');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': credential.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: input.model,
            system: input.systemPrompt || input.messages?.find((message) => message.role === 'system')?.content,
            messages,
            max_tokens: input.maxCompletionTokens ?? input.maxTokens ?? 4096,
            temperature: input.temperature ?? 0.7,
            top_p: input.topP ?? 1,
            ...(input.stop ? { stop_sequences: input.stop } : {}),
        }),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Anthropic chat failed (${response.status}): ${data?.error?.message || 'Unknown error'}`);
    const text = contentText(data?.content);
    const parsedUsage = data?.usage ? {
        provider: 'anthropic' as const,
        model: input.model,
        inputTokens: nonNegative(data.usage.input_tokens),
        outputTokens: nonNegative(data.usage.output_tokens),
        totalTokens: nonNegative(data.usage.input_tokens) + nonNegative(data.usage.output_tokens),
    } : undefined;
    return { text, modelUsed: data?.model || input.model, finishReason: data?.stop_reason, usage: parsedUsage };
}

export async function aiChatCompletion(input: ChatInput): Promise<ChatOutput> {
    const ref = parseAiModelRef(input.model);
    if (!ref || ref.provider === 'gemini') throw new Error('A non-Gemini provider:model reference is required.');
    const providerInput = { ...input, model: ref.model };
    if (ref.provider === 'groq') return groqChatCompletion(providerInput as any);
    if (ref.provider === 'nvidia') return nvidiaChatCompletion(providerInput as any);
    if (ref.provider === 'cloudflare') return cloudflareChatCompletion(providerInput as any);
    if (ref.provider === 'anthropic') return anthropicCompletion(providerInput);
    return openAiCompatibleCompletion(ref.provider, providerInput);
}
