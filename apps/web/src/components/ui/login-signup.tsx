"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Chrome, CircleStar, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import appLogo from "@/assets/Ui-logo.svg";
import { apiClient } from "@/api/client";
import { sendPasswordReset, signInWithEmail, signInWithGooglePopup, signUpWithEmail } from "@/lib/auth";

type LoginCardSectionProps = {
  onNavigate: (path: string) => void;
};

type AuthMode = "login" | "signup";

const HERO_VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_215831_c6a8989c-d716-4d8d-8745-e972a2eec711.mp4";

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

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (authMode === "signup" && !confirmPassword) return false;
    return true;
  }, [authMode, confirmPassword, email, password]);

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setInfo(null);
  };

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
    <section className="relative min-h-screen overflow-y-auto bg-[#d9dedb] text-black [font-family:'Schibsted_Grotesk',sans-serif]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <video
          src={HERO_VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-1/2 top-0 h-[115%] w-[115%] max-w-none -translate-x-1/2 object-cover object-top"
        />
        <div className="absolute inset-0 bg-white/10" />
      </div>

      <nav className="relative z-10 flex w-full items-center justify-between px-5 py-4 sm:px-8 lg:px-[120px]" aria-label="Authentication navigation">
        <button type="button" onClick={() => onNavigate("/")} className="inline-flex items-center gap-[9px] bg-transparent text-[24px] font-semibold tracking-[-1.44px] text-black">
          <img src={appLogo} alt="" className="h-7 w-7 object-contain" />
          <span>EazyUI</span>
        </button>
        <button type="button" onClick={() => onNavigate("/")} className="inline-flex h-[42px] items-center gap-2 rounded-full bg-white/45 px-4 text-[14px] font-semibold text-black backdrop-blur-md transition-colors hover:bg-white/70">
          <ArrowLeft size={15} />
          Back home
        </button>
      </nav>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-[1280px] items-center gap-10 px-5 pb-10 pt-4 sm:px-8 lg:grid-cols-[1fr_520px] lg:px-12 lg:pb-16">
        <div className="mx-auto max-w-[620px] text-center lg:mx-0 lg:text-left">
          <div className="inline-flex overflow-hidden rounded-full bg-white shadow-[0_8px_26px_rgba(0,0,0,0.08)]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e1311] px-3 py-2 text-[13px] font-medium text-white">
              <CircleStar size={14} />
              EazyUI
            </span>
            <span className="px-3 py-2 text-[13px] font-medium text-black/65">Your workspace is ready</span>
          </div>
          <h1 className="mt-8 font-['Fustat',sans-serif] text-[52px] font-bold leading-[0.98] tracking-[-3.2px] text-black sm:text-[68px] lg:text-[80px] lg:tracking-[-4.8px]">
            Pick up where your ideas left off.
          </h1>
          <p className="mx-auto mt-6 max-w-[540px] font-['Fustat',sans-serif] text-[18px] font-medium leading-[1.5] tracking-[-0.35px] text-[#505050] lg:mx-0 lg:text-[20px]">
            Sign in to generate polished interfaces, refine product screens, and keep every project moving.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[520px] rounded-[22px] bg-black/25 p-3 shadow-[0_28px_80px_rgba(0,0,0,0.16)] backdrop-blur-xl">
          <div className="rounded-[16px] bg-white p-5 shadow-[0_14px_44px_rgba(0,0,0,0.15)] sm:p-7">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-black/40">EazyUI account</p>
                <h2 className="mt-2 font-['Fustat',sans-serif] text-[30px] font-bold tracking-[-1.2px] text-black">
                  {authMode === "signup" ? "Create your workspace" : "Welcome back"}
                </h2>
              </div>
              <img src={appLogo} alt="" className="h-10 w-10 object-contain" />
            </div>

            <div className="mt-6 grid grid-cols-2 rounded-[10px] bg-[#f4f4f4] p-1">
              {(["signup", "login"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchMode(mode)}
                  className={`h-10 rounded-[8px] text-[14px] font-semibold transition-all ${authMode === mode ? "bg-black text-white shadow-sm" : "text-black/55 hover:text-black"}`}
                >
                  {mode === "signup" ? "Sign Up" : "Log In"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={loading}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-black text-[15px] font-semibold text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Chrome size={18} />}
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => setShowEmailForm((visible) => !visible)}
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#f4f4f4] text-[15px] font-semibold text-black transition-colors hover:bg-[#e9e9e9]"
            >
              <Mail size={17} />
              Continue with Email
            </button>

            {showEmailForm && (
              <div className="mt-5 space-y-3 border-t border-black/10 pt-5">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  className="h-12 w-full rounded-[10px] border border-black/10 bg-[#f8f8f8] px-4 text-[15px] text-black outline-none placeholder:text-black/40 focus:border-black/30"
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className="h-12 w-full rounded-[10px] border border-black/10 bg-[#f8f8f8] px-4 pr-12 text-[15px] text-black outline-none placeholder:text-black/40 focus:border-black/30"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-black/45 hover:bg-black/5 hover:text-black" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {authMode === "signup" && (
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    className="h-12 w-full rounded-[10px] border border-black/10 bg-[#f8f8f8] px-4 text-[15px] text-black outline-none placeholder:text-black/40 focus:border-black/30"
                  />
                )}

                {error && <p className="rounded-[8px] bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>}
                {info && <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">{info}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={loading || !canSubmit}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] bg-black text-[14px] font-semibold text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : authMode === "signup" ? "Create account" : "Log in"}
                    {!loading && <ArrowUpRight size={16} />}
                  </button>
                  {authMode === "login" && (
                    <button type="button" onClick={handleForgotPassword} disabled={loading} className="h-12 rounded-[10px] bg-[#f4f4f4] px-4 text-[13px] font-semibold text-black/60 hover:text-black disabled:opacity-50">
                      Forgot?
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-[11px] leading-5 text-black/40">
              By continuing, you agree to our <button type="button" className="font-semibold text-black/60 hover:text-black">Terms</button> and <button type="button" className="font-semibold text-black/60 hover:text-black">Privacy Policy</button>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
