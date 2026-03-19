export type DesignModelProfile = 'fast' | 'quality';

export const FAST_TEXT_MODEL_ID = 'gemini-2.5-flash';
export const QUALITY_TEXT_MODEL_ID = 'gemini-3-pro-preview';

export function getPreferredTextModel(profile: DesignModelProfile): string | undefined {
    if (profile === 'fast') return FAST_TEXT_MODEL_ID;
    return QUALITY_TEXT_MODEL_ID;
}
