"use client";
import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [resendStatus, setResendStatus] = useState<"idle" | "loading" | "sent">("idle");

  const handleResend = async () => {
    if (!email) return;
    setResendStatus("loading");
    try {
      await fetch("/api/user/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendStatus("sent");
    } catch {
      setResendStatus("idle");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AdLeak Shield</h1>
        </div>
        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-lg sm:px-10 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            We&apos;ve sent a verification link to{" "}
            <strong className="text-gray-900">{email || "your email"}</strong>.
            Click the link to activate your account and start your 7-day free trial.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Don&apos;t see it? Check your spam folder. The link expires in 24 hours.
          </p>

          {resendStatus === "sent" ? (
            <p className="text-sm text-green-600 mb-4">A new verification link has been sent.</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendStatus === "loading" || !email}
              className="text-sm font-medium text-gray-900 hover:underline underline-offset-2 disabled:opacity-50"
            >
              {resendStatus === "loading" ? "Sending..." : "Resend verification email"}
            </button>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100">
            <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-900">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}