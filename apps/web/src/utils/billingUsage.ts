export function toSingleLinePreview(value: unknown, max = 140): string | null {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

export function extractLedgerRequestPreview(
    metadata?: Record<string, unknown> | null,
    max = 140
): string | null {
    if (!metadata || typeof metadata !== 'object') return null;

    const directKeys = [
        'requestPreview',
        'request',
        'prompt',
        'promptPreview',
        'appPrompt',
        'appPromptPreview',
        'instruction',
        'instructionPreview',
        'editInstruction',
        'query',
        'text',
    ] as const;

    for (const key of directKeys) {
        const value = metadata[key];
        if (typeof value === 'string') {
            const preview = toSingleLinePreview(value, max);
            if (preview) return preview;
        }
    }

    const settlement = metadata.settlement;
    if (settlement && typeof settlement === 'object' && !Array.isArray(settlement)) {
        for (const key of directKeys) {
            const value = (settlement as Record<string, unknown>)[key];
            if (typeof value === 'string') {
                const preview = toSingleLinePreview(value, max);
                if (preview) return preview;
            }
        }
    }

    return null;
}
