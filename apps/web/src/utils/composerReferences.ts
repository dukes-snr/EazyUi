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

const INLINE_REFERENCE_PADDING_MARK = '\u00a0';
const INLINE_REFERENCE_PADDING = INLINE_REFERENCE_PADDING_MARK.repeat(5);

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
    const inserted = `${needsLeadingSpace ? ' ' : ''}${safeToken}${INLINE_REFERENCE_PADDING}${needsTrailingSpace ? ' ' : ''}`;
    const nextValue = `${before}${inserted}${after}`;
    return {
        value: nextValue,
        cursor: before.length + inserted.length,
    };
}

function stripInlineReferencePadding(value: string): string {
    return String(value || '').split(INLINE_REFERENCE_PADDING_MARK).join('');
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

export function extractComposerInlineReferences(
    value: string,
    options?: {
        allowScreen?: boolean;
        screens?: ComposerScreenReferenceOption[];
    }
): ComposerInlineReferenceParseResult {
    const source = stripInlineReferencePadding(value);
    const allowScreen = options?.allowScreen ?? false;
    const screens = Array.isArray(options?.screens) ? options!.screens : [];
    const screenByKey = new Map<string, ComposerScreenReferenceOption>();
    const seenScreenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const urlReferences: ComposerUrlReference[] = [];
    const screenReferences: ComposerScreenReferenceOption[] = [];

    screens.forEach((screen) => {
        const key = normalizeComposerScreenReferenceKey(screen.name);
        if (!key || screenByKey.has(key)) return;
        screenByKey.set(key, screen);
    });

    const cleanedText = source.replace(/(^|[\s(])@([^\s@]+)/g, (fullMatch, leading: string, rawToken: string) => {
        let token = rawToken;
        const trailingMatch = token.match(/[),.!?;:]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        if (trailing) {
            token = token.slice(0, -trailing.length);
        }

        const normalizedUrl = normalizeComposerReferenceUrl(token);
        if (normalizedUrl) {
            if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                urlReferences.push(createComposerUrlReference(normalizedUrl));
            }
            return `${leading}${token}${trailing}`;
        }

        if (allowScreen) {
            const screen = screenByKey.get(normalizeComposerScreenReferenceKey(token));
            if (screen) {
                if (!seenScreenIds.has(screen.screenId)) {
                    seenScreenIds.add(screen.screenId);
                    screenReferences.push(screen);
                }
                return `${leading}${screen.name}${trailing}`;
            }
        }

        return fullMatch;
    });

    return {
        cleanedText,
        urlReferences,
        screenReferences,
    };
}

export function getComposerInlineReferenceSegments(
    value: string,
    options?: {
        allowScreen?: boolean;
        screens?: ComposerScreenReferenceOption[];
    }
): ComposerInlineReferenceSegment[] {
    const source = stripInlineReferencePadding(value);
    if (!source) return [{ kind: 'text', text: '' }];

    const allowScreen = options?.allowScreen ?? false;
    const screens = Array.isArray(options?.screens) ? options!.screens : [];
    const screenByKey = new Map<string, ComposerScreenReferenceOption>();
    screens.forEach((screen) => {
        const key = normalizeComposerScreenReferenceKey(screen.name);
        if (!key || screenByKey.has(key)) return;
        screenByKey.set(key, screen);
    });

    const segments: ComposerInlineReferenceSegment[] = [];
    const pattern = /(^|[\s(])@([^\s@]+)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
        const leading = match[1] || '';
        const rawToken = match[2] || '';
        const tokenStart = match.index + leading.length;
        const tokenEnd = pattern.lastIndex;

        if (tokenStart > cursor) {
            segments.push({ kind: 'text', text: source.slice(cursor, tokenStart) });
        }

        let token = rawToken;
        const trailingMatch = token.match(/[),.!?;:]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        if (trailing) {
            token = token.slice(0, -trailing.length);
        }

        const tokenText = `@${token}`;
        const normalizedUrl = normalizeComposerReferenceUrl(token);
        const matchingScreen = allowScreen ? screenByKey.get(normalizeComposerScreenReferenceKey(token)) : null;

        if (normalizedUrl) {
            segments.push({ kind: 'url', text: tokenText });
            if (trailing) segments.push({ kind: 'text', text: trailing });
        } else if (matchingScreen) {
            segments.push({ kind: 'screen', text: tokenText });
            if (trailing) segments.push({ kind: 'text', text: trailing });
        } else {
            segments.push({ kind: 'text', text: source.slice(tokenStart, tokenEnd) });
        }

        cursor = tokenEnd;
    }

    if (cursor < source.length) {
        segments.push({ kind: 'text', text: source.slice(cursor) });
    }

    return segments;
}
