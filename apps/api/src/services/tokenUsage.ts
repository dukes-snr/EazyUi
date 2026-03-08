export type TokenUsageProvider = 'groq' | 'nvidia' | 'gemini' | 'unknown';

export type TokenUsageEntry = {
    provider: TokenUsageProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens?: number;
};

export type TokenUsageSummary = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    entries: TokenUsageEntry[];
};

function toNonNegativeInt(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
}

export function normalizeTokenUsageEntry(entry: TokenUsageEntry): TokenUsageEntry {
    const inputTokens = toNonNegativeInt(entry.inputTokens);
    const outputTokens = toNonNegativeInt(entry.outputTokens);
    const totalCandidate = toNonNegativeInt(entry.totalTokens);
    const totalTokens = totalCandidate > 0 ? totalCandidate : inputTokens + outputTokens;
    const cachedInputTokens = toNonNegativeInt(entry.cachedInputTokens || 0);
    return {
        provider: entry.provider || 'unknown',
        model: String(entry.model || '').trim(),
        inputTokens,
        outputTokens,
        totalTokens,
        ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
    };
}

export function summarizeTokenUsage(entries: Array<TokenUsageEntry | null | undefined>): TokenUsageSummary | undefined {
    const normalized = entries
        .filter((entry): entry is TokenUsageEntry => Boolean(entry))
        .map((entry) => normalizeTokenUsageEntry(entry));
    if (normalized.length === 0) return undefined;

    const summary = normalized.reduce<TokenUsageSummary>((acc, entry) => {
        acc.inputTokens += entry.inputTokens;
        acc.outputTokens += entry.outputTokens;
        acc.totalTokens += entry.totalTokens;
        acc.cachedInputTokens += toNonNegativeInt(entry.cachedInputTokens || 0);
        acc.entries.push(entry);
        return acc;
    }, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        entries: [],
    });

    if (summary.totalTokens === 0 && summary.inputTokens > 0) {
        summary.totalTokens = summary.inputTokens + summary.outputTokens;
    }

    return summary;
}

