import { getFirebaseDb } from './firebaseAuth.js';

export type PluginImportSession = {
    payload: Record<string, unknown>;
    createdAt: string;
    expiresAt: string;
    source?: {
        projectId?: string;
        projectName?: string;
        screenIds?: string[];
        screenNames?: string[];
    };
};

const COLLECTION_NAME = 'pluginImportSessions';
const SESSION_TTL_MS = 30 * 60 * 1000;

function docRef(uid: string) {
    return getFirebaseDb().collection(COLLECTION_NAME).doc(uid);
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function isExpired(value: string): boolean {
    const timestamp = Date.parse(value);
    return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

export async function writePluginImportSession(args: {
    uid: string;
    payload: Record<string, unknown>;
    source?: {
        projectId?: string;
        projectName?: string;
        screenIds?: string[];
        screenNames?: string[];
    };
}): Promise<void> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    await docRef(args.uid).set({
        payload: args.payload,
        createdAt,
        expiresAt,
        source: {
            projectId: args.source?.projectId || '',
            projectName: args.source?.projectName || '',
            screenIds: Array.isArray(args.source?.screenIds) ? args.source?.screenIds : [],
            screenNames: Array.isArray(args.source?.screenNames) ? args.source?.screenNames : [],
        },
    });
}

export async function consumePluginImportSession(uid: string): Promise<PluginImportSession | null> {
    const ref = docRef(uid);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const data = (snap.data() || {}) as Record<string, unknown>;
    await ref.delete();

    const payload = data.payload;
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const session: PluginImportSession = {
        payload: payload as Record<string, unknown>,
        createdAt: asString(data.createdAt),
        expiresAt: asString(data.expiresAt),
        source: {
            projectId: asString((data.source as Record<string, unknown> | undefined)?.projectId),
            projectName: asString((data.source as Record<string, unknown> | undefined)?.projectName),
            screenIds: asStringArray((data.source as Record<string, unknown> | undefined)?.screenIds),
            screenNames: asStringArray((data.source as Record<string, unknown> | undefined)?.screenNames),
        },
    };

    if (!session.expiresAt || isExpired(session.expiresAt)) {
        return null;
    }

    return session;
}
