import { getFirebaseDb } from './firebaseAuth.js';

export type PluginAuthSession = {
    token: string;
    user: {
        uid: string;
        email: string;
        displayName: string;
    };
    createdAt: string;
    expiresAt: string;
};

const COLLECTION_NAME = 'pluginAuthSessions';
const SESSION_TTL_MS = 10 * 60 * 1000;

function docRef(state: string) {
    return getFirebaseDb().collection(COLLECTION_NAME).doc(state);
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isExpired(value: string): boolean {
    const timestamp = Date.parse(value);
    return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

export async function writePluginAuthSession(args: {
    state: string;
    token: string;
    user: {
        uid: string;
        email?: string;
        displayName?: string;
    };
}): Promise<void> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    await docRef(args.state).set({
        token: args.token,
        user: {
            uid: args.user.uid,
            email: args.user.email || '',
            displayName: args.user.displayName || '',
        },
        createdAt,
        expiresAt,
    });
}

export async function consumePluginAuthSession(state: string): Promise<PluginAuthSession | null> {
    const ref = docRef(state);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const data = (snap.data() || {}) as Record<string, unknown>;
    const session: PluginAuthSession = {
        token: asString(data.token),
        user: {
            uid: asString((data.user as Record<string, unknown> | undefined)?.uid),
            email: asString((data.user as Record<string, unknown> | undefined)?.email),
            displayName: asString((data.user as Record<string, unknown> | undefined)?.displayName),
        },
        createdAt: asString(data.createdAt),
        expiresAt: asString(data.expiresAt),
    };

    await ref.delete();

    if (!session.token || !session.user.uid || !session.expiresAt || isExpired(session.expiresAt)) {
        return null;
    }

    return session;
}
