import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseDb } from './firebaseAuth.js';

type McpApiKeyStatus = 'active' | 'revoked';

type McpApiKeyGlobalDoc = {
    keyId: string;
    uid: string;
    label: string;
    keyHash: string;
    keyPrefix: string;
    status: McpApiKeyStatus;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    lastUsedIp?: string;
    lastUsedUserAgent?: string;
    revokedAt?: string;
};

type McpApiKeyUserDoc = {
    keyId: string;
    uid: string;
    label: string;
    keyPrefix: string;
    status: McpApiKeyStatus;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    lastUsedIp?: string;
    lastUsedUserAgent?: string;
    revokedAt?: string;
};

export type McpApiKeyListItem = {
    keyId: string;
    label: string;
    keyPrefix: string;
    status: McpApiKeyStatus;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    revokedAt?: string;
};

export type CreatedMcpApiKey = McpApiKeyListItem & {
    apiKey: string;
};

export type ResolvedMcpApiKey = {
    uid: string;
    keyId: string;
    label: string;
};

const MAX_LABEL_LENGTH = 80;
const API_KEY_PREFIX = 'eazy_mcp_';
const KEY_ID_LENGTH = 20;
const SECRET_BYTES = 24;
const PREFIX_PREVIEW_LEN = 18;

let pepperWarningLogged = false;

function nowIso(): string {
    return new Date().toISOString();
}

function resolvePepper(): string {
    const explicit = String(process.env.MCP_API_KEY_PEPPER || '').trim();
    if (explicit) return explicit;
    const internalFallback = String(process.env.INTERNAL_API_KEY || '').trim();
    if (internalFallback) return internalFallback;
    const insecure = 'eazyui-dev-insecure-pepper';
    if (!pepperWarningLogged) {
        pepperWarningLogged = true;
        console.warn('[MCP API Keys] MCP_API_KEY_PEPPER is not set. Falling back to insecure development pepper.');
    }
    return insecure;
}

function hashApiKey(rawKey: string): string {
    const pepper = resolvePepper();
    return createHmac('sha256', pepper).update(rawKey).digest('hex');
}

function buildApiKey(keyId: string): string {
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    return `${API_KEY_PREFIX}${keyId}_${secret}`;
}

function normalizeLabel(input: unknown): string {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return 'MCP Key';
    return raw.length <= MAX_LABEL_LENGTH ? raw : raw.slice(0, MAX_LABEL_LENGTH);
}

function toKeyPrefix(rawKey: string): string {
    return rawKey.slice(0, PREFIX_PREVIEW_LEN);
}

function normalizeKeyId(raw: string): string | null {
    const value = raw.trim().toLowerCase();
    if (!/^[a-z0-9_-]{8,64}$/.test(value)) return null;
    return value;
}

function parseApiKey(raw: unknown): { keyId: string; normalizedKey: string } | null {
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token.startsWith(API_KEY_PREFIX)) return null;
    const rest = token.slice(API_KEY_PREFIX.length);
    const separatorIndex = rest.indexOf('_');
    if (separatorIndex <= 0) return null;
    const keyIdRaw = rest.slice(0, separatorIndex);
    const keyId = normalizeKeyId(keyIdRaw);
    if (!keyId) return null;
    const secret = rest.slice(separatorIndex + 1);
    if (secret.length < 16) return null;
    return {
        keyId,
        normalizedKey: `${API_KEY_PREFIX}${keyId}_${secret}`,
    };
}

function stableHashEquals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function toListItem(doc: McpApiKeyUserDoc): McpApiKeyListItem {
    return {
        keyId: doc.keyId,
        label: doc.label || 'MCP Key',
        keyPrefix: doc.keyPrefix,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        lastUsedAt: doc.lastUsedAt,
        revokedAt: doc.revokedAt,
    };
}

function makeKeyId(): string {
    return randomUUID().replace(/-/g, '').slice(0, KEY_ID_LENGTH);
}

export async function listMcpApiKeys(uid: string): Promise<McpApiKeyListItem[]> {
    const db = getFirebaseDb();
    const snap = await db.collection(`users/${uid}/mcpApiKeys`).orderBy('createdAt', 'desc').limit(50).get();
    return snap.docs.map((doc) => {
        const data = doc.data() as Partial<McpApiKeyUserDoc>;
        return toListItem({
            keyId: data.keyId || doc.id,
            uid,
            label: data.label || 'MCP Key',
            keyPrefix: data.keyPrefix || `${API_KEY_PREFIX}***`,
            status: data.status === 'revoked' ? 'revoked' : 'active',
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
            lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : undefined,
            revokedAt: typeof data.revokedAt === 'string' ? data.revokedAt : undefined,
            lastUsedIp: typeof data.lastUsedIp === 'string' ? data.lastUsedIp : undefined,
            lastUsedUserAgent: typeof data.lastUsedUserAgent === 'string' ? data.lastUsedUserAgent : undefined,
        });
    });
}

export async function createMcpApiKey(uid: string, labelInput?: string): Promise<CreatedMcpApiKey> {
    const db = getFirebaseDb();
    const keyId = makeKeyId();
    const apiKey = buildApiKey(keyId);
    const now = nowIso();
    const label = normalizeLabel(labelInput);
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = toKeyPrefix(apiKey);

    const globalDoc: McpApiKeyGlobalDoc = {
        keyId,
        uid,
        label,
        keyHash,
        keyPrefix,
        status: 'active',
        createdAt: now,
        updatedAt: now,
    };
    const userDoc: McpApiKeyUserDoc = {
        keyId,
        uid,
        label,
        keyPrefix,
        status: 'active',
        createdAt: now,
        updatedAt: now,
    };

    const batch = db.batch();
    batch.set(db.doc(`mcpApiKeys/${keyId}`), globalDoc);
    batch.set(db.doc(`users/${uid}/mcpApiKeys/${keyId}`), userDoc);
    await batch.commit();

    return {
        ...toListItem(userDoc),
        apiKey,
    };
}

export async function revokeMcpApiKey(uid: string, keyIdRaw: string): Promise<boolean> {
    const db = getFirebaseDb();
    const rawKeyId = String(keyIdRaw || '').trim();
    if (!rawKeyId) return false;
    const normalizedKeyId = normalizeKeyId(rawKeyId);
    const candidateIds = Array.from(new Set([
        rawKeyId,
        rawKeyId.toLowerCase(),
        normalizedKeyId || '',
    ].filter(Boolean)));

    let userRef: ReturnType<typeof db.doc> | null = null;
    let keyId = '';
    for (const candidate of candidateIds) {
        const ref = db.doc(`users/${uid}/mcpApiKeys/${candidate}`);
        const snap = await ref.get();
        if (!snap.exists) continue;
        userRef = ref;
        keyId = candidate;
        break;
    }
    if (!userRef || !keyId) return false;

    const now = nowIso();
    const batch = db.batch();
    batch.set(userRef, {
        status: 'revoked',
        updatedAt: now,
        revokedAt: now,
    }, { merge: true });
    batch.set(db.doc(`mcpApiKeys/${keyId}`), {
        status: 'revoked',
        updatedAt: now,
        revokedAt: now,
    }, { merge: true });
    await batch.commit();
    return true;
}

export async function resolveMcpApiKey(rawApiKey: string, usage?: { ip?: string; userAgent?: string }): Promise<ResolvedMcpApiKey | null> {
    const parsed = parseApiKey(rawApiKey);
    if (!parsed) return null;
    const db = getFirebaseDb();
    const globalRef = db.doc(`mcpApiKeys/${parsed.keyId}`);
    const globalSnap = await globalRef.get();
    if (!globalSnap.exists) return null;
    const data = globalSnap.data() as Partial<McpApiKeyGlobalDoc>;
    if (!data || data.status !== 'active' || typeof data.uid !== 'string' || !data.uid) return null;
    if (typeof data.keyHash !== 'string' || data.keyHash.length < 16) return null;
    const computed = hashApiKey(parsed.normalizedKey);
    if (!stableHashEquals(data.keyHash, computed)) return null;

    const now = nowIso();
    const usagePatch = {
        lastUsedAt: now,
        lastUsedIp: usage?.ip || null,
        lastUsedUserAgent: usage?.userAgent || null,
        updatedAt: now,
        lastResolvedAt: FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.set(globalRef, usagePatch, { merge: true });
    batch.set(db.doc(`users/${data.uid}/mcpApiKeys/${parsed.keyId}`), usagePatch, { merge: true });
    await batch.commit();

    return {
        uid: data.uid,
        keyId: parsed.keyId,
        label: typeof data.label === 'string' && data.label.trim() ? data.label : 'MCP Key',
    };
}
