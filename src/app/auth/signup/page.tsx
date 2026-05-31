"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpSchema } from "@/lib/validators/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const parsed = signUpSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create account. Please try again.");
        setIsLoading(false);
        return;
      }

      // Redirect to "check your email" page
      router.push(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AdLeak Shield</h1>
          <p className="mt-1 text-sm text-gray-500">Stop wasting Google Ads budget</p>
        </div>
        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-lg sm:px-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Start your free trial</h2>
          <p className="text-sm text-gray-500 mb-6">7 days free · No credit card required</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="you@yourbusiness.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" autoComplete="new-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="At least 8 characters" />
              <p className="mt-1 text-xs text-gray-400">Must include uppercase, lowercase, and a number</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150">
              {isLoading ? "Creating account..." : "Create free account"}
            </button>
            <p className="text-xs text-gray-400 text-center">By creating an account you agree to our Terms of Service and Privacy Policy.</p>
          </form>
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-gray-900 hover:underline underline-offset-2">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}