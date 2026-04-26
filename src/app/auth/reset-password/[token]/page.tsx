"use client";
// =============================================================================
// AdLeak Shield — Reset Password Page
// src/app/auth/reset-password/[token]/page.tsx
//
// The [token] in the folder name is a dynamic route parameter.
// When a user visits /auth/reset-password/abc123, Next.js automatically
// passes "abc123" as params.token to this component.
// =============================================================================

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordSchema } from "@/lib/validators/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const parsed = resetPasswordSchema.safeParse({
      token,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to reset password. Please try again.");
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => router.push("/auth/login"), 3000);
    } catch {
      setError("Something went wrong. Please try again.");
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
          {success ? (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Password updated
              </h2>
              <p className="text-sm text-gray-500">
                Your password has been reset successfully. Redirecting you to
                sign in...
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Choose a new password
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                This link expires after 1 hour and can only be used once.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                               placeholder-gray-400 focus:outline-none focus:ring-2
                               focus:ring-gray-900 focus:border-transparent
                               disabled:bg-gray-50"
                    placeholder="At least 8 characters"
                    disabled={isLoading}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Must include uppercase, lowercase, and a number
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                               placeholder-gray-400 focus:outline-none focus:ring-2
                               focus:ring-gray-900 focus:border-transparent
                               disabled:bg-gray-50"
                    placeholder="••••••••"
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
                  {isLoading ? "Updating..." : "Update password"}
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
