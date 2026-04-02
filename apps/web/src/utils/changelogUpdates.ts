import { useEffect, useState } from 'react';

const CHANGELOG_STORAGE_KEY = 'eazyui:changelog-last-seen-id';
const CHANGELOG_SEEN_EVENT = 'eazyui:changelog-seen';

export const CHANGELOG_ENTRY_IDS = [
    'v1.9.1',
    'v1.9.0',
    'v1.8.6',
    'v1.8.0',
    'v1.7.4',
    'v1.7.1',
    'v1.6.9',
] as const;

export function getLatestChangelogEntryId(): string {
    return CHANGELOG_ENTRY_IDS[0] || '';
}

export function getUnseenChangelogCount(): number {
    if (typeof window === 'undefined') return 0;
    const latestId = getLatestChangelogEntryId();
    if (!latestId) return 0;

    const lastSeenId = window.localStorage.getItem(CHANGELOG_STORAGE_KEY);
    if (!lastSeenId) return CHANGELOG_ENTRY_IDS.length;

    const lastSeenIndex = CHANGELOG_ENTRY_IDS.indexOf(lastSeenId as (typeof CHANGELOG_ENTRY_IDS)[number]);
    return lastSeenIndex >= 0 ? lastSeenIndex : CHANGELOG_ENTRY_IDS.length;
}

export function markLatestChangelogSeen(): void {
    if (typeof window === 'undefined') return;
    const latestId = getLatestChangelogEntryId();
    if (!latestId) return;

    window.localStorage.setItem(CHANGELOG_STORAGE_KEY, latestId);
    window.dispatchEvent(new CustomEvent(CHANGELOG_SEEN_EVENT));
}

export function useChangelogUnseenCount(): number {
    const [count, setCount] = useState(() => getUnseenChangelogCount());

    useEffect(() => {
        const sync = () => setCount(getUnseenChangelogCount());

        sync();
        window.addEventListener(CHANGELOG_SEEN_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CHANGELOG_SEEN_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return count;
}
