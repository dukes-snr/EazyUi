import { getFirebaseAuth } from './firebase-admin.js';

export interface AuthenticatedIdentity {
  uid: string;
  email?: string;
}

function parseBearerToken(headerValue: string | undefined): string {
  const value = String(headerValue || '').trim();
  if (!value) throw new Error('Missing authorization header');
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('Invalid authorization header');
  return match[1].trim();
}

export async function verifyAuthorizationHeader(
  authorization: string | undefined,
): Promise<AuthenticatedIdentity> {
  const auth = getFirebaseAuth();
  const token = parseBearerToken(authorization);
  const decoded = await auth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
  };
}
