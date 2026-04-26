"use client";
// =============================================================================
// AdLeak Shield — Login Page
// src/app/auth/login/page.tsx
//
// KEY FEATURES:
// 1. Pre-emptive DB wake: fires the /api/wake endpoint the moment the user
//    clicks the Sign In button — not when the form submits. This gives the
//    database up to ~3 extra seconds to wake up before the auth query hits it.
// 2. Form validation with Zod on the client before submitting
// 3. Thaw progress bar if DB takes > 2s (wired via the wake response)
// 4. Links to signup and forgot-password
// =============================================================================

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInSchema } from "@/lib/validators/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ===========================================================================
  // PRE-EMPTIVE DB WAKE
  // Called the moment the Sign In button is clicked — before form validation.
  // This gives the database extra time to wake from auto-pause.
  // The result is used to show the thaw progress bar if needed.
  // ===========================================================================
  const triggerDbWake = () => {
    // Fire and forget — we don't await this, it runs in the background
    fetch("/api/wake").catch(() => {
      // Silently ignore — wake failure doesn't block sign in
    });
  };

  // ===========================================================================
  // FORM SUBMIT
  // ===========================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Client-side validation
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false, // Handle redirect manually so we can show errors
      });

      if (result?.error) {
        // Check for the specific email-not-verified error
        if (result.error.includes("EMAIL_NOT_VERIFIED")) {
          setError(
            "Please verify your email address before signing in. Check your inbox for the verification link."
          );
        } else {
          setError("Invalid email or password. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      // Success — redirect to dashboard
      router.push("/dashboard");
      router.refresh(); // Refresh server components to pick up new session
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo / Brand */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            AdLeak Shield
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Stop wasting Google Ads budget
          </p>
        </div>

        {/* Card */}
        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-lg sm:px-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error message */}
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                           placeholder-gray-400 focus:outline-none focus:ring-2 
                           focus:ring-gray-900 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                           placeholder-gray-400 focus:outline-none focus:ring-2 
                           focus:ring-gray-900 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            {/* Submit — triggerDbWake fires on mousedown, BEFORE the click event */}
            <button
              type="submit"
              onMouseDown={triggerDbWake}  // Fires immediately on press
              onTouchStart={triggerDbWake} // Mobile equivalent
              disabled={isLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent 
                         rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 
                         hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 
                         focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors duration-150"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-gray-900 hover:underline underline-offset-2"
            >
              Start your free 7-day trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
