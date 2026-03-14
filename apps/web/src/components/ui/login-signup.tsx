"use client";

import { useMemo, useState } from "react";
import { Chrome, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import appLogo from "@/assets/Ui-logo.png";
import heroBg from "@/assets/img1.jpg";
import { apiClient } from "@/api/client";
import { sendPasswordReset, signInWithEmail, signInWithGooglePopup, signUpWithEmail } from "@/lib/auth";
import { SHOWCASE_SCREEN_IMAGES } from "@/utils/showcaseImages";

type LoginCardSectionProps = {
  onNavigate: (path: string) => void;
};

type AuthMode = "login" | "signup";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createReelLanes(pool: readonly string[], laneCount = 6, laneLength = 5): string[][] {
  if (pool.length === 0) {
    return Array.from({ length: laneCount }, () => []);
  }
  const lanes: string[][] = [];
  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    const randomized = shuffle([...pool]);
    const lane: string[] = [];
    for (let itemIndex = 0; itemIndex < laneLength; itemIndex += 1) {
      lane.push(randomized[(itemIndex + laneIndex) % randomized.length]);
    }
    lanes.push(lane);
  }
  return lanes;
}

function userMessage(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (code.includes("auth/invalid-email")) return "Please enter a valid email address.";
  if (code.includes("auth/user-not-found")) return "No account found for this email.";
  if (code.includes("auth/wrong-password")) return "Incorrect password.";
  if (code.includes("auth/email-already-in-use")) return "This email is already in use.";
  if (code.includes("auth/weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("auth/popup-closed-by-user")) return "Google sign-in was cancelled.";
  return "Authentication failed. Please try again.";
}

export default function LoginCardSection({ onNavigate }: LoginCardSectionProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const reelLanes = useMemo(() => createReelLanes(SHOWCASE_SCREEN_IMAGES, 6, 6), []);

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (authMode === "signup" && !confirmPassword) return false;
    return true;
  }, [authMode, confirmPassword, email, password]);

  const submit = async () => {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (authMode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setLoading(true);
      if (authMode === "signup") {
        const credential = await signUpWithEmail(cleanEmail, password);
        try {
          await apiClient.sendAccountWelcomeEmail(cleanEmail, credential.user.uid);
        } catch (emailError) {
          console.warn("Welcome email failed:", emailError);
        }
      } else {
        await signInWithEmail(cleanEmail, password);
      }
      onNavigate("/app");
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      await signInWithGooglePopup();
      onNavigate("/app");
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Enter your email first, then click forgot password.");
      return;
    }
    try {
      setLoading(true);
      await sendPasswordReset(cleanEmail);
      setInfo("Password reset email sent.");
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="fixed inset-0 overflow-hidden bg-[#07090d] text-white">
      <style>{`
        @keyframes auth-reel-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes auth-reel-down {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
      `}</style>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.14,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(85%_70%_at_74%_15%,rgba(52,94,179,0.22),rgba(8,10,15,0.7)_54%,rgba(7,9,13,0.96)_100%)]" />

      <div className="relative z-10 h-full w-full p-3 md:p-5">
        <div className="grid h-full w-full grid-cols-1 overflow-hidden lg:grid-cols-[1fr_1.18fr]">
          <div className="relative flex min-h-[420px] flex-col justify-center px-8 py-8 lg:px-11 lg:py-10">
            <div className="absolute left-6 top-6 flex items-center gap-2 text-[19px] font-semibold tracking-tight text-white/90">
              <img src={appLogo} alt="EazyUI logo" className="h-5 w-5 object-contain" />
              <span>eazyui</span>
            </div>

            <div className="mx-auto w-full max-w-[420px] text-center">
              <img src={appLogo} alt="EazyUI symbol" className="mx-auto h-12 w-12 object-contain opacity-95" />

              <h1 className="mt-7 text-[42px] font-semibold leading-[1.04] tracking-[-0.03em] text-white">
                Design &amp; Refine
                <br />
                <span className="text-[#9de8af]">AI-powered UI screens in minutes</span>
              </h1>

              <button
                type="button"
                onClick={continueWithGoogle}
                disabled={loading}
                className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-[#111827] transition-colors hover:bg-[#e9edf4] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Chrome size={18} />}
                Continue with Google
              </button>

              {/* <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled
                  title="GitHub auth not enabled yet"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white/5 text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <Github size={18} />
                </button>
                <button
                  type="button"
                  disabled
                  title="Apple auth not enabled yet"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white/5 text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <Apple size={18} />
                </button>
                <button
                  type="button"
                  disabled
                  title="Facebook auth not enabled yet"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white/5 text-[18px] font-semibold text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  f
                </button>
              </div> */}

              <button
                type="button"
                onClick={() => setShowEmailForm((v) => !v)}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white/5 px-5 text-[15px] font-medium text-white/90 transition-colors hover:bg-white/10"
              >
                <Mail size={16} />
                Continue with Email
              </button>

              {showEmailForm && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-left">
                  <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={`h-8 rounded-lg text-xs font-semibold uppercase tracking-[0.08em] ${authMode === "login" ? "bg-white/15 text-white" : "text-gray-300 hover:bg-white/10"}`}
                    >
                      Log In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={`h-8 rounded-lg text-xs font-semibold uppercase tracking-[0.08em] ${authMode === "signup" ? "bg-white/15 text-white" : "text-gray-300 hover:bg-white/10"}`}
                    >
                      Sign Up
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Email address"
                      className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password"
                        className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 pr-10 text-sm text-white placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-300 hover:bg-white/10"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {authMode === "signup" && (
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm password"
                        className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
                      />
                    )}
                  </div>

                  {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
                  {info && <p className="mt-2 text-xs text-emerald-300">{info}</p>}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={loading || !canSubmit}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[#1b1b1b] text-sm font-semibold text-white hover:bg-[#1b1b1b] disabled:cursor-not-allowed disabled:opacity-65"
                    >
                      {loading ? <Loader2 size={15} className="animate-spin" /> : authMode === "signup" ? "Create account" : "Log in"}
                    </button>
                    {authMode === "login" && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={loading}
                        className="h-10 rounded-xl border border-white/15 px-3 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-65"
                      >
                        Forgot
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="mt-5 text-xs text-gray-400">
                By continuing, you agree to our{" "}
                <button type="button" className="text-gray-200 underline underline-offset-2">Terms of Service</button>{" "}
                and{" "}
                <button type="button" className="text-gray-200 underline underline-offset-2">Privacy Policy</button>.
              </p>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="grid h-full place-items-center">
              <div className="relative h-full w-full overflow-hidden rounded-[18px]">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${heroBg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    opacity: 0.5,
                  }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(75%_75%_at_16%_82%,rgba(255,255,255,0.45),rgba(53,204,226,0.5)_38%,rgba(41, 41, 41, 0.88)_78%)]" />

                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-md bg-[#f2a25f] px-2.5 py-1 text-[11px] font-semibold text-white">
                  EazyUI Beta
                </div>

                <div className="relative z-10 grid h-full place-items-center">
                  <div className="relative h-full w-full overflow-hidden">
                    <div className="absolute inset-0 scale-[1.22] -rotate-[12deg]">
                      <div className="flex h-full items-start justify-center gap-2">
                        {reelLanes.map((lane, laneIndex) => {
                          const isEvenLane = laneIndex % 2 === 0;
                          const durationSec = 32 + laneIndex * 4.5;
                          const repeated = [...lane, ...lane];
                          return (
                            <div key={`lane-${laneIndex}`} className="h-[138%] w-[186px] flex-none overflow-hidden">
                              <div
                                className="flex flex-col gap-2"
                                style={{
                                  animationName: isEvenLane ? "auth-reel-up" : "auth-reel-down",
                                  animationDuration: `${durationSec}s`,
                                  animationTimingFunction: "linear",
                                  animationIterationCount: "infinite",
                                }}
                              >
                                {repeated.map((imageUrl, idx) => (
                                  <div
                                    key={`${laneIndex}-${idx}-${imageUrl}`}
                                    className="relative w-full overflow-hidden rounded-[18px] bg-[#0a1322]"
                                  >
                                    <img
                                      src={imageUrl}
                                      alt={`EazyUI mobile showcase ${idx + 1}`}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
