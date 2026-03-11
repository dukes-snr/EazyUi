export type ComposerReferenceRootOptionKey = 'url' | 'screen';

export type ComposerReferenceTextRange = {
    start: number;
    end: number;
};

export type ComposerReferenceRootOption = {
    key: ComposerReferenceRootOptionKey;
    label: string;
    description: string;
};

export type ComposerScreenReferenceOption = {
    screenId: string;
    name: string;
};

export type ComposerUrlReference = {
    id: string;
    url: string;
    label: string;
};

export type ComposerInlineReferenceParseResult = {
    cleanedText: string;
    urlReferences: ComposerUrlReference[];
    screenReferences: ComposerScreenReferenceOption[];
};

export type ComposerInlineReferenceSegment =
    | { kind: 'text'; text: string }
    | { kind: 'url'; text: string }
    | { kind: 'screen'; text: string };

export type ComposerAtomicReferenceRange = {
    start: number;
    end: number;
    text: string;
    kind: 'url' | 'screen';
    url?: string;
    screen?: ComposerScreenReferenceOption;
};

type ComposerReferenceResolutionOptions = {
    allowScreen?: boolean;
    screens?: ComposerScreenReferenceOption[];
};

const ROOT_OPTIONS: ComposerReferenceRootOption[] = [
    {
        key: 'url',
        label: 'url:',
        description: 'Attach a web page as reference context.',
    },
    {
        key: 'screen',
        label: 'screen:',
        description: 'Reuse an existing screen as continuity context.',
    },
];

export function findComposerReferenceTrigger(value: string, cursor: number): { query: string; range: ComposerReferenceTextRange } | null {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) return null;
    const query = match[1] || '';
    return {
        query,
        range: {
            start: cursor - query.length - 1,
            end: cursor,
        },
    };
}

export function removeComposerReferenceTrigger(value: string, range: ComposerReferenceTextRange): string {
    return `${value.slice(0, range.start)}${value.slice(range.end)}`.replace(/\s{2,}/g, ' ');
}

export function replaceComposerReferenceTrigger(value: string, range: ComposerReferenceTextRange, token: string): { value: string; cursor: number } {
    const safeToken = token.startsWith('@') ? token : `@${token}`;
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const inserted = `${needsLeadingSpace ? ' ' : ''}${safeToken}${needsTrailingSpace ? ' ' : ''}`;
    const nextValue = `${before}${inserted}${after}`;
    return {
        value: nextValue,
        cursor: before.length + inserted.length,
    };
}

export function getFilteredComposerReferenceRootOptions(query: string, allowScreenOption: boolean): ComposerReferenceRootOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    return ROOT_OPTIONS
        .filter((option) => allowScreenOption || option.key !== 'screen')
        .filter((option) => {
            if (!normalizedQuery) return true;
            return option.label.toLowerCase().includes(normalizedQuery) || option.description.toLowerCase().includes(normalizedQuery);
        });
}

export function normalizeComposerReferenceUrl(value: string): string | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return null;
    }
}

export function getComposerReferenceHostname(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./i, '');
    } catch {
        return url;
    }
}

export function createComposerUrlReference(url: string): ComposerUrlReference {
    return {
        id: url,
        url,
        label: getComposerReferenceHostname(url),
    };
}

export function normalizeComposerScreenReferenceKey(value: string): string {
    return String(value || '')
        .replace(/^@/, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

export function formatComposerScreenReferenceToken(name: string): string {
    const normalized = String(name || '').replace(/[^a-z0-9]/gi, '');
    return `@${normalized || 'screen'}`;
}

export function formatComposerUrlReferenceToken(url: string): string {
    const normalized = normalizeComposerReferenceUrl(url) || String(url || '').trim();
    const compact = normalized
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');
    return `@${compact}`;
}

export function getComposerAtomicReferenceRanges(
    value: string,
    options?: ComposerReferenceResolutionOptions
): ComposerAtomicReferenceRange[] {
    const source = String(value || '');
    const allowScreen = options?.allowScreen ?? false;
    const screens = Array.isArray(options?.screens) ? options.screens : [];
    const screenByKey = new Map<string, ComposerScreenReferenceOption>();

    screens.forEach((screen) => {
        const key = normalizeComposerScreenReferenceKey(screen.name);
        if (!key || screenByKey.has(key)) return;
        screenByKey.set(key, screen);
    });

    const ranges: ComposerAtomicReferenceRange[] = [];
    const pattern = /(^|[\s(])@([^\s@]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
        const leading = match[1] || '';
        let rawToken = match[2] || '';
        const trailingMatch = rawToken.match(/[),.!?;:]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        if (trailing) {
            rawToken = rawToken.slice(0, -trailing.length);
        }
        if (!rawToken) continue;
        const text = `@${rawToken}`;
        const start = match.index + leading.length;
        const end = start + text.length;
        const normalizedUrl = normalizeComposerReferenceUrl(rawToken);

        if (normalizedUrl) {
            ranges.push({
                start,
                end,
                text,
                kind: 'url',
                url: normalizedUrl,
            });
            continue;
        }

        if (!allowScreen) continue;
        const screen = screenByKey.get(normalizeComposerScreenReferenceKey(rawToken));
        if (!screen) continue;
        ranges.push({
            start,
            end,
            text,
            kind: 'screen',
            screen,
        });
    }

    return ranges;
}

export function clampComposerReferenceCursor(
    value: string,
    cursor: number,
    options?: ComposerReferenceResolutionOptions
): number {
    const ranges = getComposerAtomicReferenceRanges(value, options);
    for (const range of ranges) {
        if (cursor > range.start && cursor < range.end) {
            return range.end;
        }
    }
    return cursor;
}

export function removeComposerAtomicReferenceAtSelection(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    direction: 'backward' | 'forward',
    options?: ComposerReferenceResolutionOptions
): { value: string; cursor: number } | null {
    const source = String(value || '');
    const ranges = getComposerAtomicReferenceRanges(source, options);
    if (!ranges.length) return null;

    if (selectionStart !== selectionEnd) {
        let nextStart = selectionStart;
        let nextEnd = selectionEnd;
        let touched = false;

        ranges.forEach((range) => {
            if (selectionEnd <= range.start || selectionStart >= range.end) return;
            nextStart = Math.min(nextStart, range.start);
            nextEnd = Math.max(nextEnd, range.end);
            touched = true;
        });

        if (!touched) return null;
        return {
            value: `${source.slice(0, nextStart)}${source.slice(nextEnd)}`.replace(/ {2,}/g, ' '),
            cursor: nextStart,
        };
    }

    const targetRange = ranges.find((range) => (
        direction === 'backward'
            ? selectionStart > range.start && selectionStart <= range.end
            : selectionStart >= range.start && selectionStart < range.end
    ));
    if (!targetRange) {
        if (direction === 'backward' && selectionStart > 0 && source[selectionStart - 1] === ' ') {
            const spacedRange = ranges.find((range) => range.end === selectionStart - 1);
            if (spacedRange) {
                return {
                    value: `${source.slice(0, spacedRange.start)}${source.slice(selectionStart)}`.replace(/ {2,}/g, ' '),
                    cursor: spacedRange.start,
                };
            }
        }
        return null;
    }

    return {
        value: `${source.slice(0, targetRange.start)}${source.slice(targetRange.end)}`.replace(/ {2,}/g, ' '),
        cursor: targetRange.start,
    };
}

export function extractComposerInlineReferences(
    value: string,
    options?: ComposerReferenceResolutionOptions
): ComposerInlineReferenceParseResult {
    const source = String(value || '');
    const ranges = getComposerAtomicReferenceRanges(source, options);
    const seenScreenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const urlReferences: ComposerUrlReference[] = [];
    const screenReferences: ComposerScreenReferenceOption[] = [];
    let cleanedText = '';
    let cursor = 0;

    ranges.forEach((range) => {
        if (range.start > cursor) {
            cleanedText += source.slice(cursor, range.start);
        }
        if (range.kind === 'url' && range.url) {
            if (!seenUrls.has(range.url)) {
                seenUrls.add(range.url);
                urlReferences.push(createComposerUrlReference(range.url));
            }
            cleanedText += range.text.slice(1);
        } else if (range.kind === 'screen' && range.screen) {
            if (!seenScreenIds.has(range.screen.screenId)) {
                seenScreenIds.add(range.screen.screenId);
                screenReferences.push(range.screen);
            }
            cleanedText += range.screen.name;
        }
        cursor = range.end;
    });

    if (cursor < source.length) {
        cleanedText += source.slice(cursor);
    }

    return {
        cleanedText,
        urlReferences,
        screenReferences,
    };
}

export function getComposerInlineReferenceSegments(
    value: string,
    options?: ComposerReferenceResolutionOptions
): ComposerInlineReferenceSegment[] {
    const source = String(value || '');
    if (!source) return [{ kind: 'text', text: '' }];
    const segments: ComposerInlineReferenceSegment[] = [];
    let cursor = 0;
    const ranges = getComposerAtomicReferenceRanges(source, options);

    ranges.forEach((range) => {
        if (range.start > cursor) {
            segments.push({ kind: 'text', text: source.slice(cursor, range.start) });
        }
        segments.push({ kind: range.kind, text: range.text });
        cursor = range.end;
    });

    if (cursor < source.length) {
        segments.push({ kind: 'text', text: source.slice(cursor) });
    }

    return segments;
}
