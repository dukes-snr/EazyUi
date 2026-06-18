export type DesignModelProfile = 'fast' | 'quality';

export const FAST_TEXT_MODEL_ID = 'gemini-2.5-flash';
// Previous Pro model. Keep for quick restoration when it becomes available again.
// export const QUALITY_TEXT_MODEL_ID = 'gemini-3-pro-preview';
export const QUALITY_TEXT_MODEL_ID = (import.meta.env.VITE_QUALITY_TEXT_MODEL_ID as string | undefined)?.trim()
    || 'moonshotai/kimi-k2.6';

export function getPreferredTextModel(profile: DesignModelProfile): string | undefined {
    if (profile === 'fast') return FAST_TEXT_MODEL_ID;
    return QUALITY_TEXT_MODEL_ID;
}
