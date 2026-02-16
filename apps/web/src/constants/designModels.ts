export type DesignModelProfile = 'fast' | 'quality';

export const FAST_TEXT_MODEL_ID = 'gemini-2.5-flash';

export function getPreferredTextModel(profile: DesignModelProfile): string | undefined {
    if (profile === 'fast') return FAST_TEXT_MODEL_ID;
    return undefined;
}
