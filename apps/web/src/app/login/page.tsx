"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useI18n } from "../i18n/I18nProvider";
import {
  fetchJson,
  formatError,
  type SetupStatus,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

const initialForm = {
  email: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void checkSetupStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkSetupStatus() {
    try {
      const status = await fetchJson<SetupStatus>("/auth/setup-status");

      if (!status.isSetupComplete) {
        router.replace("/setup");
        return;
      }
    } catch {
      // Let the user stay on the page and see API errors during sign-in attempts.
    } finally {
      setIsCheckingStatus(false);
    }
  }

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

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader"
            role="status"
            aria-label="Checking setup status"
          />
          <p className="text-on-surface-variant text-sm font-medium tracking-wide">
            {t("common.loading.signIn")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      <div className="mb-5 w-full max-w-[420px] flex justify-end">
        <LanguageSwitcher />
      </div>

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
          {t("login.title")}
        </h1>
        <p className="mt-1 text-on-surface-variant text-sm leading-relaxed">
          {t("login.subtitle")}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
            >
              {t("login.email")} <span className="text-on-error-container">*</span>
            </label>
            <input
              id="email"
              type="email"
              placeholder={t("login.emailPlaceholder")}
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
              {t("login.password")} <span className="text-on-error-container">*</span>
            </label>
            <input
              id="password"
              type="password"
              placeholder={t("login.passwordPlaceholder")}
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
            {isSubmitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-on-surface-variant text-sm">
          {t("login.setupNote")}
        </p>
      </div>

      {/* API indicator */}
      <p className="mt-6 text-outline text-xs opacity-60">
        {t("common.api")}: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}
      </p>
    </div>
  );
}
