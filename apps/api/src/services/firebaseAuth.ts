import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

export type AuthUserContext = {
    uid: string;
    email?: string;
};

function parseServiceAccountFromEnv(): Record<string, unknown> | null {
    const jsonPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
    if (jsonPath) {
        try {
            const fromFile = fs.readFileSync(jsonPath, 'utf8');
            return JSON.parse(fromFile) as Record<string, unknown>;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_PATH value', error);
        }
    }

    const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (rawJson) {
        try {
            return JSON.parse(rawJson) as Record<string, unknown>;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_JSON value', error);
        }
    }

    const rawB64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
    if (rawB64) {
        try {
            const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
            return JSON.parse(decoded) as Record<string, unknown>;
        } catch (error) {
            console.warn('[Auth] Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 value', error);
        }
    }

    return null;
}

function ensureFirebaseAdmin() {
    if (getApps().length > 0) return getApps()[0];

    const serviceAccount = parseServiceAccountFromEnv();
    if (serviceAccount) {
        return initializeApp({
            credential: cert(serviceAccount as any),
        });
    }

    return initializeApp({
        credential: applicationDefault(),
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
