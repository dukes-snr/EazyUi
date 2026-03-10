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
