import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';

export type AuthUserContext = {
    uid: string;
    email?: string;
};

let cachedServiceAccount: Record<string, unknown> | null | undefined;

function parseServiceAccountFromEnv(): Record<string, unknown> | null {
    if (cachedServiceAccount !== undefined) {
        return cachedServiceAccount;
    }

    const jsonPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
    if (jsonPath) {
        try {
            const fromFile = fs.readFileSync(jsonPath, 'utf8');
            cachedServiceAccount = JSON.parse(fromFile) as Record<string, unknown>;
            return cachedServiceAccount;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_PATH value', error);
        }
    }

    const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (rawJson) {
        try {
            cachedServiceAccount = JSON.parse(rawJson) as Record<string, unknown>;
            return cachedServiceAccount;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_JSON value', error);
        }
    }

    const rawB64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
    if (rawB64) {
        try {
            const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
            cachedServiceAccount = JSON.parse(decoded) as Record<string, unknown>;
            return cachedServiceAccount;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 value', error);
        }
    }

    cachedServiceAccount = null;
    return cachedServiceAccount;
}

function resolveFirebaseStorageBucketName(serviceAccount: Record<string, unknown> | null): string | undefined {
    const direct = String(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
    if (direct) return direct;
    const projectId = String(
        process.env.FIREBASE_PROJECT_ID
        || process.env.VITE_FIREBASE_PROJECT_ID
        || serviceAccount?.project_id
        || ''
    ).trim();
    return projectId ? `${projectId}.firebasestorage.app` : undefined;
}

function ensureFirebaseAdmin() {
    if (getApps().length > 0) return getApps()[0];

    const serviceAccount = parseServiceAccountFromEnv();
    const storageBucket = resolveFirebaseStorageBucketName(serviceAccount);
    if (serviceAccount) {
        return initializeApp({
            credential: cert(serviceAccount as any),
            ...(storageBucket ? { storageBucket } : {}),
        });
    }

    return initializeApp({
        credential: applicationDefault(),
        ...(storageBucket ? { storageBucket } : {}),
    });
}

function parseBearerToken(headerValue: string | undefined): string {
    const value = String(headerValue || '').trim();
    if (!value) throw new Error('Missing authorization header');
    const match = value.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) throw new Error('Invalid authorization header');
    return match[1].trim();
}

export async function verifyAuthHeader(headerValue: string | undefined): Promise<AuthUserContext> {
    ensureFirebaseAdmin();
    const token = parseBearerToken(headerValue);
    const decoded = await getAuth().verifyIdToken(token);
    return {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
}

export function getFirebaseDb() {
    ensureFirebaseAdmin();
    return getFirestore();
}

export function getFirebaseStorageBucket(): ReturnType<ReturnType<typeof getStorage>['bucket']> {
    const app = ensureFirebaseAdmin();
    const configuredBucket = resolveFirebaseStorageBucketName(parseServiceAccountFromEnv());
    return configuredBucket ? getStorage(app).bucket(configuredBucket) : getStorage(app).bucket();
}
