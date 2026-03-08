import type { BillingLedgerItem } from '@/api/client';

export type BillingUsageActivityRow = {
    key: string;
    item: BillingLedgerItem;
    actionLabel: string;
    metadataReason: string;
    requestPreview: string | null;
    deductedCredits: number;
    tokensUsed: number | null;
    modelName: string;
    requestIdentifier: string;
};

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

function toSafeNumber(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
}

export function extractLedgerTotalTokens(metadata?: Record<string, unknown> | null): number | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const direct = toSafeNumber((metadata as any)?.usage?.totalTokens);
    if (direct !== null && direct >= 0) return Math.max(0, Math.round(direct));
    const quoted = toSafeNumber((metadata as any)?.usageQuote?.totals?.totalTokens);
    if (quoted !== null && quoted >= 0) return Math.max(0, Math.round(quoted));
    const settlementDirect = toSafeNumber((metadata as any)?.settlement?.usage?.totalTokens);
    if (settlementDirect !== null && settlementDirect >= 0) return Math.max(0, Math.round(settlementDirect));
    return null;
}

export function extractLedgerModelName(metadata?: Record<string, unknown> | null): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const direct = typeof (metadata as any).model === 'string' ? String((metadata as any).model).trim() : '';
    if (direct) return direct;
    const fromLineItems = (metadata as any)?.usageQuote?.lineItems;
    if (Array.isArray(fromLineItems)) {
        const candidate = fromLineItems.find((row: any) => typeof row?.model === 'string' && row.model.trim().length > 0);
        if (candidate?.model) return String(candidate.model).trim();
    }
    const fromUsageEntries = (metadata as any)?.usage?.entries;
    if (Array.isArray(fromUsageEntries)) {
        const candidate = fromUsageEntries.find((row: any) => typeof row?.model === 'string' && row.model.trim().length > 0);
        if (candidate?.model) return String(candidate.model).trim();
    }
    return null;
}

export function extractLedgerDeductedCredits(item: BillingLedgerItem): number {
    if (item.creditsDelta < 0) {
        return Math.abs(Math.round(item.creditsDelta));
    }

    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : null;
    const finalChargedDirect = toSafeNumber((metadata as any)?.finalChargedCredits);
    if (finalChargedDirect !== null && finalChargedDirect >= 0) return Math.max(0, Math.round(finalChargedDirect));

    const finalChargedNested = toSafeNumber((metadata as any)?.settlement?.finalChargedCredits);
    if (finalChargedNested !== null && finalChargedNested >= 0) return Math.max(0, Math.round(finalChargedNested));

    const usageQuoteCredits = toSafeNumber((metadata as any)?.usageQuote?.credits);
    if (usageQuoteCredits !== null && usageQuoteCredits >= 0) return Math.max(0, Math.round(usageQuoteCredits));

    const reservedCredits = toSafeNumber((metadata as any)?.reservedCredits);
    if (item.type === 'reserve' && reservedCredits !== null && reservedCredits >= 0) {
        return Math.max(0, Math.round(reservedCredits));
    }

    return 0;
}

function toLedgerTimestamp(item: BillingLedgerItem): number {
    return new Date(item.createdAt).getTime();
}

function firstDefined<T>(values: Array<T | null | undefined>): T | null {
    for (const value of values) {
        if (value !== null && value !== undefined && value !== '') return value as T;
    }
    return null;
}

export function buildBillingUsageActivityRows(
    items: BillingLedgerItem[],
    startTs = 0
): BillingUsageActivityRow[] {
    const groups = new Map<string, BillingLedgerItem[]>();

    for (const item of items) {
        const createdAt = toLedgerTimestamp(item);
        if (!Number.isFinite(createdAt) || createdAt < startTs) continue;
        if (item.type !== 'reserve' && item.type !== 'refund' && item.type !== 'settle') continue;
        if (!item.operation && !item.requestId && !item.reservationId) continue;

        const key = item.reservationId || item.requestId || item.id;
        const existing = groups.get(key);
        if (existing) existing.push(item);
        else groups.set(key, [item]);
    }

    return Array.from(groups.entries())
        .map(([key, group]) => {
            const ordered = [...group].sort((a, b) => toLedgerTimestamp(a) - toLedgerTimestamp(b));
            const newestFirst = [...ordered].reverse();
            const representative = newestFirst[0];
            const actionItem = firstDefined(newestFirst.filter((item) => Boolean(item.operation))) || representative;
            const metadataReason = firstDefined(
                newestFirst.map((item) => (typeof item.metadata?.reason === 'string' ? item.metadata.reason : null))
            ) || '';
            const requestPreview = firstDefined(newestFirst.map((item) => extractLedgerRequestPreview(item.metadata)));
            const tokensUsed = firstDefined(newestFirst.map((item) => extractLedgerTotalTokens(item.metadata)));
            const modelName = firstDefined(newestFirst.map((item) => extractLedgerModelName(item.metadata))) || 'Default model';
            const requestIdentifier = representative.requestId || representative.reservationId || key;
            const deductedCredits = Math.max(
                0,
                Math.round(-ordered.reduce((sum, item) => sum + Number(item.creditsDelta || 0), 0))
            );

            return {
                key,
                item: representative,
                actionLabel: String(actionItem.operation || representative.type).replace(/_/g, ' '),
                metadataReason,
                requestPreview,
                deductedCredits,
                tokensUsed,
                modelName,
                requestIdentifier,
            } satisfies BillingUsageActivityRow;
        })
        .filter((row) => row.deductedCredits > 0)
        .sort((a, b) => toLedgerTimestamp(b.item) - toLedgerTimestamp(a.item));
}
