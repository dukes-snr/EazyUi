import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Chrome, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { sendPasswordReset, signInWithEmail, signInWithGooglePopup } from '../../lib/auth';

type PluginAuthBridgePageProps = {
  authReady: boolean;
  authUser: User | null;
};

type BridgeStatus = 'idle' | 'posting' | 'done' | 'error';
const DEFAULT_AUTH_API_BASE = 'https://eazyui-api.onrender.com/api';

function resolveAuthApiBase() {
  const queryValue = new URLSearchParams(window.location.search).get('apiBase') || '';
  const envValue = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '';
  return queryValue.trim() || envValue || DEFAULT_AUTH_API_BASE;
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!contentType.includes('application/json')) {
    throw new Error('The plugin auth endpoint returned HTML instead of JSON. Set Vercel `VITE_API_BASE_URL` to the Render API URL.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The plugin auth endpoint returned invalid JSON.');
  }
}

function getStateParam() {
  return new URLSearchParams(window.location.search).get('state') || '';
}

function getUserLabel(user: User | null) {
  if (!user) return '';
  return user.displayName || user.email || user.uid;
}

function userMessage(error: unknown) {
  const code = (error as { code?: string })?.code || '';
  if (code.includes('auth/invalid-email')) return 'Enter a valid email address.';
  if (code.includes('auth/user-not-found')) return 'No account was found for that email.';
  if (code.includes('auth/wrong-password')) return 'Incorrect password.';
  if (code.includes('auth/invalid-credential')) return 'Incorrect email or password.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
  if (code.includes('auth/popup-closed-by-user')) return 'Google sign-in was cancelled.';
  if (code.includes('auth/network-request-failed')) return 'Network error. Check your connection and try again.';
  return error instanceof Error && error.message ? error.message : 'Authentication failed. Please try again.';
}

export function PluginAuthBridgePage({ authReady, authUser }: PluginAuthBridgePageProps) {
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const postedRef = useRef(false);
  const state = useMemo(() => getStateParam(), []);
  const authApiBase = useMemo(() => resolveAuthApiBase(), []);

  useEffect(() => {
    if (!authReady || !authUser || postedRef.current) return;

    let cancelled = false;
    postedRef.current = true;
    setStatus('posting');
    setBridgeError(null);

    void (async () => {
      try {
        const token = await authUser.getIdToken(true);
        if (cancelled) return;

        const response = await fetch(`${authApiBase}/plugin-auth/session/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            state,
            user: {
              uid: authUser.uid,
              email: authUser.email || '',
              displayName: authUser.displayName || '',
            },
          }),
        });

        if (!response.ok) {
          let message = 'Failed to complete the Figma plugin session.';
          try {
            const body = await parseJsonResponse(response);
            if (body && typeof body.message === 'string' && body.message.trim()) {
              message = body.message.trim();
            }
          } catch {
            // Ignore malformed error payloads.
          }
          throw new Error(message);
        }

        setStatus('done');
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            // Ignore close failures in restricted browsers.
          }
        }, 500);
      } catch (nextError) {
        if (cancelled) return;
        postedRef.current = false;
        setStatus('error');
        setBridgeError(nextError instanceof Error ? nextError.message : 'Failed to create the Figma plugin session.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authApiBase, authReady, authUser, state]);

  const submitEmailPassword = async () => {
    const cleanEmail = email.trim();
    setAuthError(null);
    setAuthInfo(null);

    if (!cleanEmail || !password) {
      setAuthError('Enter your email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      await signInWithEmail(cleanEmail, password);
    } catch (error) {
      setAuthError(userMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      setAuthInfo(null);
      await signInWithGooglePopup();
    } catch (error) {
      setAuthError(userMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    setAuthError(null);
    setAuthInfo(null);

    if (!cleanEmail) {
      setAuthError('Enter your email first, then request a reset link.');
      return;
    }

    try {
      setAuthLoading(true);
      await sendPasswordReset(cleanEmail);
      setAuthInfo('Password reset email sent.');
    } catch (error) {
      setAuthError(userMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0b1016] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#121821] p-7 text-center shadow-[0_32px_80px_rgba(0,0,0,0.32)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/8">
            <Loader2 size={20} className="animate-spin" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Preparing plugin sign-in</h1>
          <p className="mt-2 text-sm leading-6 text-white/70">Checking whether you already have an active EazyUI session.</p>
        </div>
      </div>
    );
  }

  if (authUser) {
    const userLabel = getUserLabel(authUser);
    return (
      <div className="min-h-screen bg-[#0b1016] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[28px] border border-emerald-400/20 bg-[#121821] p-7 text-center shadow-[0_32px_80px_rgba(0,0,0,0.32)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/12 text-emerald-300">
            {status === 'error' ? '!' : <Loader2 size={20} className={status === 'done' ? '' : 'animate-spin'} />}
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em]">
            {status === 'error' ? 'Plugin authentication failed' : `Authenticated as ${userLabel}`}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/72">
            {status === 'error'
              ? bridgeError || 'The plugin token could not be returned to Figma.'
              : 'Returning to Figma and completing plugin authentication automatically.'}
          </p>
          {status === 'error' ? (
            <button
              type="button"
              onClick={() => {
                postedRef.current = false;
                setStatus('idle');
                setBridgeError(null);
              }}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#111827]"
            >
              Try again
            </button>
          ) : (
            <p className="mt-5 text-xs uppercase tracking-[0.14em] text-white/45">
              This window should close automatically.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1016] text-white px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(36,175,232,0.18),rgba(18,24,33,0.98)_52%)] p-8 shadow-[0_40px_90px_rgba(0,0,0,0.34)] lg:p-10">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              EazyUI Plugin Auth
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-white">
              Sign in to connect
              <br />
              your EazyUI projects to Figma
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/72">
              This page is dedicated to the Figma plugin. Use Google or your EazyUI email and password, then the page will return to Figma automatically once authentication is confirmed.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Step 1</div>
                <div className="mt-2 text-sm font-medium text-white">Authenticate here</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Step 2</div>
                <div className="mt-2 text-sm font-medium text-white">Token is sent back to the plugin</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Step 3</div>
                <div className="mt-2 text-sm font-medium text-white">Project browser unlocks in Figma</div>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-[#121821] p-7 shadow-[0_32px_80px_rgba(0,0,0,0.3)] lg:p-8">
            <div className="flex items-center gap-2 text-sm font-medium text-white/76">
              <Mail size={16} />
              Figma plugin sign-in
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Authenticate your account</h2>
            <p className="mt-2 text-sm leading-6 text-white/66">
              After sign-in, this page will automatically finish authentication for the plugin and close.
            </p>

            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={authLoading}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-[#111827] transition-colors hover:bg-[#e9edf4] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {authLoading ? <Loader2 size={18} className="animate-spin" /> : <Chrome size={18} />}
              Continue with Google
            </button>

            <div className="mt-5 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-white/36">
              <div className="h-px flex-1 bg-white/10" />
              <span>Or use email</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                className="h-12 w-full rounded-2xl border border-white/12 bg-white/5 px-4 text-sm text-white placeholder:text-white/35 focus:border-white/28 focus:outline-none"
              />

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="h-12 w-full rounded-2xl border border-white/12 bg-white/5 px-4 pr-12 text-sm text-white placeholder:text-white/35 focus:border-white/28 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authError ? <p className="mt-3 text-sm text-rose-300">{authError}</p> : null}
            {authInfo ? <p className="mt-3 text-sm text-emerald-300">{authInfo}</p> : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={submitEmailPassword}
                disabled={authLoading || !email.trim() || !password}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#1f6feb] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2b78f0] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {authLoading ? <Loader2 size={18} className="animate-spin" /> : 'Sign in with email'}
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={authLoading}
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 px-5 text-sm font-medium text-white/82 transition-colors hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-65"
              >
                Forgot password
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PluginAuthBridgePage;
