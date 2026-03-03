"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, ChevronLeft, ChevronRight, Chrome, Eye, EyeOff, Github, Loader2, Mail } from "lucide-react";
import appLogo from "@/assets/Ui-logo.png";
import heroBg from "@/assets/img1.jpg";
import { sendPasswordReset, signInWithEmail, signInWithGooglePopup, signUpWithEmail } from "@/lib/auth";

type LoginCardSectionProps = {
  onNavigate: (path: string) => void;
};

type AuthMode = "login" | "signup";

type Slide = {
  imageUrl: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    imageUrl: "https://i.postimg.cc/tJv2Ct25/01-dashboard.png",
    title: "Built for teams",
    subtitle: "Build, test, and ship polished interfaces together with less back-and-forth.",
  },
  {
    imageUrl: "https://i.postimg.cc/WzNH44Vx/01-profile.png",
    title: "Design with context",
    subtitle: "Keep component language consistent across every screen in your project.",
  },
  {
    imageUrl: "https://i.postimg.cc/L59bssSc/02-home-feed.png",
    title: "From prompt to product",
    subtitle: "Turn ideas into production-ready screens with structure, hierarchy, and speed.",
  },
];

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
  const [activeSlide, setActiveSlide] = useState(0);
  const [pauseSlide, setPauseSlide] = useState(false);

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (authMode === "signup" && !confirmPassword) return false;
    return true;
  }, [authMode, confirmPassword, email, password]);

  useEffect(() => {
    if (pauseSlide) return;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [pauseSlide]);

  const goPrev = () => {
    setActiveSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const goNext = () => {
    setActiveSlide((prev) => (prev + 1) % SLIDES.length);
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
        await signUpWithEmail(cleanEmail, password);
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
                Build Full-Stack
                <br />
                <span className="text-[#9de8af]">Web &amp; Mobile Apps in minutes</span>
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

              <div className="mt-3 grid grid-cols-3 gap-2">
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
              </div>

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
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[#5b8df7] text-sm font-semibold text-white hover:bg-[#6b99f9] disabled:cursor-not-allowed disabled:opacity-65"
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
              <div
                className="relative h-full w-full overflow-hidden rounded-[18px] border border-white/15"
                onMouseEnter={() => setPauseSlide(true)}
                onMouseLeave={() => setPauseSlide(false)}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${heroBg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    opacity: 0.5,
                  }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(75%_75%_at_16%_82%,rgba(255,255,255,0.45),rgba(53,204,226,0.5)_38%,rgba(39,97,196,0.88)_78%)]" />

                <div className="absolute right-4 top-4 rounded-md bg-[#f2a25f] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                  EazyUI Beta
                </div>

                <div className="relative z-10 flex h-full flex-col items-center justify-start px-8 pt-20 pb-8">
                  <h2 className="text-[50px] font-semibold leading-none tracking-[-0.02em] text-white">
                    Built for teams
                  </h2>
                  <p className="mt-4 max-w-[540px] text-center text-lg font-medium text-white/85">
                    {SLIDES[activeSlide].subtitle}
                  </p>

                  <div className="mt-10 w-full max-w-[760px] overflow-hidden rounded-2xl border border-black/40 bg-[#05070d]/80 shadow-[0_22px_45px_rgba(0,0,0,0.45)]">
                    <div className="flex items-center gap-2 border-b border-white/15 bg-black/70 px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/90" />
                      <span className="ml-3 text-[11px] uppercase tracking-[0.08em] text-white/65">{SLIDES[activeSlide].title}</span>
                    </div>
                    <div className="relative h-[460px] overflow-hidden bg-black/40">
                      {SLIDES.map((slide, index) => (
                        <img
                          key={slide.imageUrl}
                          src={slide.imageUrl}
                          alt={slide.title}
                          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${index === activeSlide ? "opacity-100" : "opacity-0"}`}
                          loading={index === 0 ? "eager" : "lazy"}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={goPrev}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/35 text-[#11396f] hover:bg-white/55"
                      aria-label="Previous slide"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      {SLIDES.map((_, idx) => (
                        <button
                          key={`indicator-${idx}`}
                          type="button"
                          onClick={() => setActiveSlide(idx)}
                          className={`h-1.5 rounded-full transition-all ${idx === activeSlide ? "w-10 bg-white" : "w-2.5 bg-white/45 hover:bg-white/70"}`}
                          aria-label={`Go to slide ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={goNext}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/35 text-[#11396f] hover:bg-white/55"
                      aria-label="Next slide"
                    >
                      <ChevronRight size={17} />
                    </button>
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
