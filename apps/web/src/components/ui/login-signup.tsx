"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Github, Lock, Mail, Chrome } from "lucide-react";
import appLogo from "@/assets/Ui-logo.png";
import heroBg from "@/assets/img1.jpg";
import { sendPasswordReset, signInWithEmail, signInWithGooglePopup, signUpWithEmail } from "@/lib/auth";

type LoginCardSectionProps = {
  onNavigate: (path: string) => void;
};

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
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
      setError("Enter your email first, then click Forgot Password.");
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
    <section className="fixed inset-0 bg-[#1a1b1f] text-white">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.12,
        }}
      />

      <div className="h-full w-full p-5 md:p-10">
        <div className="relative h-full w-full overflow-hidden">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/8" />
          <div className="pointer-events-none absolute -left-2 -top-10 h-44 w-44 rounded-full bg-white/6" />
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-white/8" />
          <div className="pointer-events-none absolute right-10 -bottom-14 h-44 w-44 rounded-full bg-white/6" />

          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-[320px] origin-center transform-gpu scale-[1.16] md:scale-[1.28]">
              <div className="mb-8 flex items-center justify-center gap-2 text-gray-400">
                <img src={appLogo} alt="EazyUI logo" className="h-4 w-4 object-contain" />
                <span className="text-[16px] font-medium">EazyUI</span>
              </div>

              <div className="mb-3 grid grid-cols-2 rounded-md border border-white/10 bg-[#0f1015] p-1">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`h-7 rounded-sm text-[11px] font-medium transition-colors ${
                    authMode === "login" ? "bg-[#1b1d24] text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`h-7 rounded-sm text-[11px] font-medium transition-colors ${
                    authMode === "signup" ? "bg-[#1b1d24] text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={continueWithGoogle}
                  disabled={loading}
                  className="h-8 rounded-md border-white/10 bg-[#111217] text-[11px] text-gray-200 hover:bg-white/10"
                >
                  <Chrome className="mr-1.5 h-3.5 w-3.5" />
                  Google
                </Button>
                <Button
                  variant="outline"
                  disabled
                  className="h-8 rounded-md border-white/10 bg-[#111217] text-[11px] text-gray-500"
                  title="GitHub provider not enabled in this form yet"
                >
                  <Github className="mr-1.5 h-3.5 w-3.5" />
                  GitHub
                </Button>
              </div>

              <div className="relative my-3">
                <Separator className="bg-white/10" />
                <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-black px-2 text-[10px] text-gray-500">
                  or
                </span>
              </div>

              <div className="grid gap-2.5">
                <div className="grid gap-1.5">
                  <Label htmlFor="email" className="text-[10px] text-gray-400">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="h-9 rounded-md border-white/10 bg-[#111217] pl-9 text-[12px] text-gray-100 placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="password" className="text-[10px] text-gray-400">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="********"
                      className="h-9 rounded-md border-white/10 bg-[#111217] pl-9 pr-9 text-[12px] text-gray-100 placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-200"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {authMode === "signup" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="password-again" className="text-[10px] text-gray-400">
                      Password Again
                    </Label>
                    <Input
                      id="password-again"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="********"
                      className="h-9 rounded-md border-white/10 bg-[#111217] text-[12px] text-gray-100 placeholder:text-gray-500"
                    />
                  </div>
                )}

                {error && <p className="text-[10px] text-rose-300">{error}</p>}
                {info && <p className="text-[10px] text-emerald-300">{info}</p>}

                <Button
                  onClick={submit}
                  disabled={loading}
                  className="mt-1 h-9 rounded-md bg-[#ff6a00] text-[12px] font-semibold text-white hover:bg-[#ff7f24] disabled:opacity-60"
                >
                  {loading ? "Please wait..." : authMode === "signup" ? "Sign Up ->" : "Log In ->"}
                </Button>
              </div>

              <p className="mt-6 text-center text-[10px] text-gray-500">
                {authMode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button type="button" onClick={() => setAuthMode("login")} className="text-gray-300 hover:text-white">
                      Log In
                    </button>{" "}
                    | Legal
                  </>
                ) : (
                  <>
                    <button type="button" onClick={handleForgotPassword} className="text-gray-300 hover:text-white">
                      Forgot Password
                    </button>{" "}
                    |{" "}
                    <button type="button" onClick={() => setAuthMode("signup")} className="text-gray-300 hover:text-white">
                      Sign Up
                    </button>{" "}
                    | Legal
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
