export type DesignModelProfile = 'fast' | 'quality';

// The server resolves these profile aliases through the central catalog and the
// signed-in user's model settings. No provider-specific model IDs belong here.
export const FAST_TEXT_MODEL_ID = 'profile:fast';
export const QUALITY_TEXT_MODEL_ID = 'profile:quality';

export function getPreferredTextModel(profile: DesignModelProfile): string | undefined {
    if (profile === 'fast') return FAST_TEXT_MODEL_ID;
    return QUALITY_TEXT_MODEL_ID;
}
