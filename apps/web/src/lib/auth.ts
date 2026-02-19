import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

async function syncProviderProfile(user: User) {
  const provider = user.providerData.find((p) => p.providerId === "google.com") || user.providerData.find((p) => Boolean(p?.photoURL || p?.displayName));
  if (!provider) return;

  const next: { displayName?: string; photoURL?: string } = {};
  if (!user.displayName && provider.displayName) next.displayName = provider.displayName;
  if (!user.photoURL && provider.photoURL) next.photoURL = provider.photoURL;
  if (Object.keys(next).length > 0) {
    await updateProfile(user, next);
  }
}

export async function signInWithGooglePopup() {
  const result = await signInWithPopup(auth, googleProvider);
  const additional = getAdditionalUserInfo(result);
  const profile = (additional?.profile || {}) as { picture?: string; name?: string };
  if ((!result.user.photoURL && profile.picture) || (!result.user.displayName && profile.name)) {
    await updateProfile(result.user, {
      photoURL: result.user.photoURL || profile.picture,
      displayName: result.user.displayName || profile.name,
    });
  }
  await syncProviderProfile(result.user);
  await result.user.reload();
  return result;
}

export function signOutCurrentUser() {
  return signOut(auth);
}

export function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export function sendCurrentUserVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error("No authenticated user.");
  }
  return sendEmailVerification(auth.currentUser);
}

export function observeAuthState(cb: Parameters<typeof onAuthStateChanged>[1]) {
  return onAuthStateChanged(auth, cb);
}
