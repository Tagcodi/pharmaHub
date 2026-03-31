"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

const initialForm = {
  pharmacySlug: "",
  email: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function field(key: keyof typeof initialForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await fetchJson<SessionResponse & { accessToken: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify(form) }
      );
      window.localStorage.setItem(TOKEN_KEY, result.accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      {/* Glassmorphism card */}
      <div
        className="w-full max-w-[420px] rounded-[8px] p-10"
        style={{
          background: "rgba(255,255,255,0.80)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 12px 40px rgba(0, 66, 83, 0.08)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-8 h-8 rounded-[4px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #004253, #005b71)",
            }}
          >
            <span className="text-white text-xs font-black">P</span>
          </div>
          <span className="text-on-surface font-bold tracking-tight">PharmaHub</span>
        </div>

        <h1 className="text-[1.5rem] font-bold text-on-surface tracking-[-0.025em]">
          Welcome back
        </h1>
        <p className="mt-1 text-on-surface-variant text-sm leading-relaxed">
          Sign into your pharmacy workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {/* Pharmacy slug */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="slug"
              className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
            >
              Pharmacy slug <span className="text-on-error-container">*</span>
            </label>
            <input
              id="slug"
              type="text"
              placeholder="pharmahub-addis"
              required
              value={form.pharmacySlug}
              onChange={field("pharmacySlug")}
              className="h-11 px-4 rounded-lg bg-surface-low text-on-surface text-sm
                placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
            >
              Email <span className="text-on-error-container">*</span>
            </label>
            <input
              id="email"
              type="email"
              placeholder="owner@pharmahub.et"
              required
              value={form.email}
              onChange={field("email")}
              className="h-11 px-4 rounded-lg bg-surface-low text-on-surface text-sm
                placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
            >
              Password <span className="text-on-error-container">*</span>
            </label>
            <input
              id="password"
              type="password"
              placeholder="Your password"
              required
              minLength={8}
              value={form.password}
              onChange={field("password")}
              className="h-11 px-4 rounded-lg bg-surface-low text-on-surface text-sm
                placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>

          {/* Error */}
          {error ? (
            <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">
              {error}
            </div>
          ) : null}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 rounded-[4px] text-white font-bold text-sm tracking-wide mt-2 disabled:opacity-60 transition-opacity cursor-pointer"
            style={{
              background: isSubmitting
                ? "#004253"
                : "linear-gradient(135deg, #004253, #005b71)",
            }}
          >
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-surface-high" />
          <span className="text-outline text-xs">or</span>
          <div className="flex-1 h-px bg-surface-high" />
        </div>

        <p className="mt-4 text-center text-on-surface-variant text-sm">
          No pharmacy yet?{" "}
          <Link
            href="/bootstrap"
            className="text-primary font-semibold hover:underline"
          >
            Bootstrap one
          </Link>
        </p>
      </div>

      {/* API indicator */}
      <p className="mt-6 text-outline text-xs opacity-60">
        API: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}
      </p>
    </div>
  );
}
