const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3-pro-preview';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

const GEMINI_TEXT_FALLBACK_MODEL = 'gemini-2.5-pro';

export function getDefaultGeminiTextModel(): string {
    return DEFAULT_GEMINI_TEXT_MODEL;
}

export function getDefaultGeminiImageModel(): string {
    return DEFAULT_GEMINI_IMAGE_MODEL;
}

export function normalizeGeminiTextModel(input?: string | null): string {
    const requested = String(input || '').trim();
    if (!requested) return DEFAULT_GEMINI_TEXT_MODEL;
    return requested;
}

export function normalizeGeminiImageModel(input?: string | null): string {
    const requested = String(input || '').trim();
    if (!requested) return DEFAULT_GEMINI_IMAGE_MODEL;
    return requested;
}

export function resolveGeminiTextFallbackModel(input?: string | null): string {
    const normalized = normalizeGeminiTextModel(input);
    return normalized === GEMINI_TEXT_FALLBACK_MODEL ? GEMINI_TEXT_FALLBACK_MODEL : GEMINI_TEXT_FALLBACK_MODEL;
}

export function isGeminiModelResolutionError(error: unknown): boolean {
    const message = String((error as Error)?.message || '').toLowerCase();
    return (
        message.includes('models/') && message.includes('not found')
        || message.includes('model not found')
        || message.includes('unsupported model')
        || message.includes('unknown model')
        || message.includes('not available for api version')
        || message.includes('permission denied on resource project')
        || (message.includes('404') && message.includes('model'))
    );
}
