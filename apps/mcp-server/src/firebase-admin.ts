import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

function parseServiceAccountFromEnv(): Record<string, unknown> | null {
  const jsonPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (jsonPath) {
    try {
      const fromFile = fs.readFileSync(jsonPath, 'utf8');
      return JSON.parse(fromFile) as Record<string, unknown>;
    } catch {
      // ignore and fall through
    }
  }

  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      // ignore and fall through
    }
  }

  const rawB64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      // ignore and fall through
    }
  }

  return null;
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return initializeApp({ credential: cert(serviceAccount as any) });
  }
  return initializeApp({ credential: applicationDefault() });
}

export function getFirebaseAuth() {
  ensureFirebaseAdmin();
  return getAuth();
}

export function getFirebaseDb() {
  ensureFirebaseAdmin();
  return getFirestore();
}
