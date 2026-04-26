"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type VerifyState = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const params = useParams();
  const token = params.token as string;
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasRun = React.useRef(false);
  
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!token) {
      setState("error");
      setErrorMessage("Invalid verification link.");
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch("/api/user/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState("error");
          setErrorMessage(data.error ?? "Verification failed.");
          return;
        }

        setState("success");
      } catch {
        setState("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AdLeak Shield</h1>
        </div>
        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-lg sm:px-10 text-center">
          {state === "loading" && (
            <>
              <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
                <svg className="animate-spin h-8 w-8 text-gray-900" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying your email</h2>
              <p className="text-sm text-gray-500">Just a moment...</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Email verified</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your account is now active. You can sign in and start your 7-day free trial.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex justify-center py-2.5 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors duration-150"
              >
                Sign in to your account
              </Link>
            </>
          )}

          {state === "error" && (
            <>
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification failed</h2>
              <p className="text-sm text-gray-500 mb-6">{errorMessage}</p>
              <Link href="/auth/login" className="text-sm font-medium text-gray-900 hover:underline underline-offset-2">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}