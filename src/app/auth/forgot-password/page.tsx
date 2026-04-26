"use client";
// =============================================================================
// AdLeak Shield — Forgot Password Page
// src/app/auth/forgot-password/page.tsx
// =============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { forgotPasswordSchema } from "@/lib/validators/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      await fetch("/api/user/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });
      // Always show success — never reveal if email exists
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            AdLeak Shield
          </h1>
        </div>

        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-lg sm:px-10">
          {submitted ? (
            // Success state
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-sm text-gray-500 mb-6">
                If an account exists for <strong>{email}</strong>, you will
                receive a password reset link within a few minutes. Check your
                spam folder if you don&apos;t see it.
              </p>
              <Link
                href="/auth/login"
                className="text-sm font-medium text-gray-900 hover:underline underline-offset-2"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            // Form state
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Reset your password
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email address and we&apos;ll send you a link to
                reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

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
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                               placeholder-gray-400 focus:outline-none focus:ring-2
                               focus:ring-gray-900 focus:border-transparent
                               disabled:bg-gray-50"
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent
                             rounded-md shadow-sm text-sm font-medium text-white bg-gray-900
                             hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2
                             focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors duration-150"
                >
                  {isLoading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                <Link
                  href="/auth/login"
                  className="font-medium text-gray-900 hover:underline underline-offset-2"
                >
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
