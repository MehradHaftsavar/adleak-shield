// =============================================================================
// AdLeak Shield — Auth Validation Schemas
// src/lib/validators/auth.ts
//
// WHY ZOD?
// Zod validates data before it touches the database.
// Every form submission is untrusted input — Zod ensures the shape and content
// are exactly what we expect before any processing happens.
//
// These schemas are shared between the server (API routes) and client
// (form validation feedback) to keep rules consistent.
// =============================================================================

import { z } from "zod";

// =============================================================================
// SIGN IN
// Email must be a valid email format. Password must exist.
// We don't give detailed error messages on sign in — "invalid credentials"
// for everything — to prevent email enumeration attacks.
// =============================================================================
export const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(254, "Email is too long")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(72, "Password is too long"), // bcrypt max is 72 bytes
});

// =============================================================================
// SIGN UP
// Stricter validation — we give helpful feedback here since it's a new account.
// Password rules: 8+ chars, at least one uppercase, one lowercase, one number.
// =============================================================================
export const signUpSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address")
      .max(254, "Email is too long")
      .toLowerCase()
      .trim(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be under 72 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// =============================================================================
// FORGOT PASSWORD
// Just an email — we send a reset link to it.
// =============================================================================
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(254, "Email is too long")
    .toLowerCase()
    .trim(),
});

// =============================================================================
// RESET PASSWORD
// The new password must meet the same rules as sign up.
// The token is validated server-side — we just pass it through here.
// =============================================================================
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be under 72 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// TypeScript types derived from the schemas — use these in your components
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
