"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchJson,
  formatError,
  type SetupStatus,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

const initialForm = {
  pharmacyName: "",
  pharmacySlug: "",
  branchName: "Main Branch",
  branchAddress: "",
  ownerFullName: "",
  ownerEmail: "",
  ownerPassword: "",
};

export default function SetupPage() {
  const router = useRouter();
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

      if (status.isSetupComplete) {
        const token = window.localStorage.getItem(TOKEN_KEY);

        if (token) {
          try {
            await fetchJson<SessionResponse>("/auth/me", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            router.replace("/dashboard");
            return;
          } catch {
            window.localStorage.removeItem(TOKEN_KEY);
          }
        }

        router.replace("/login");
        return;
      }
    } catch {
      // Keep the setup form available if the API is temporarily unreachable.
    } finally {
      setIsCheckingStatus(false);
    }
  }

  function toSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function field(key: keyof typeof initialForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "pharmacyName") {
          next.pharmacySlug = toSlug(value);
        }
        return next;
      });
    };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await fetchJson<SessionResponse & { accessToken: string }>(
        "/auth/setup",
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
            Checking setup status…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-low flex">
      {/* ── Left hero panel ──────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col justify-between w-[44%] p-14 text-white"
        style={{
          background: "linear-gradient(135deg, #004253, #005b71)",
        }}
      >
        <div>
          {/* Brand eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/70 text-xs font-bold tracking-widest uppercase mb-10">
            PharmaHub
          </div>

          <h1 className="text-[2.75rem] font-bold leading-[1.05] tracking-[-0.04em] max-w-xs">
            Set up your pharmacy in minutes.
          </h1>

          <p className="mt-5 text-white/65 text-[0.95rem] leading-[1.75] max-w-[22rem]">
            Create your pharmacy workspace, first branch, and owner account
            in one step. Everything is wired to the real API.
          </p>
        </div>

        {/* Feature list */}
        <ul className="space-y-3">
          {[
            "Multi-branch inventory tracking",
            "Offline-first architecture",
            "Ethiopian pharmacy compliance",
            "Role-based access: Owner · Pharmacist · Cashier",
          ].map((item) => (
            <li
              key={item}
              className="flex items-center gap-3 text-white/75 text-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        {/* Bottom note */}
        <p className="text-white/35 text-xs mt-10">
          First-time setup only. Owner credentials are permanent.
        </p>
      </aside>

      {/* ── Right form panel ─────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-[540px]">
          {/* Mobile brand */}
          <div className="lg:hidden mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase">
              PharmaHub
            </span>
          </div>

          <h2 className="text-[1.65rem] font-bold text-on-surface tracking-[-0.025em]">
            Set up your pharmacy
          </h2>
          <p className="mt-1 text-on-surface-variant text-sm leading-relaxed">
            Create the first owner account and default branch.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
          >
            {/* Pharmacy details */}
            <fieldset className="space-y-4">
              <legend className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-3">
                Pharmacy
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Pharmacy name"
                  id="pharmacyName"
                  placeholder="PharmaHub Addis"
                  required
                  value={form.pharmacyName}
                  onChange={field("pharmacyName")}
                />
                <FormField
                  label="Pharmacy slug"
                  id="pharmacySlug"
                  placeholder="auto-generated"
                  value={form.pharmacySlug}
                  onChange={field("pharmacySlug")}
                  readOnly
                  hint="Auto-generated from name"
                />
              </div>
            </fieldset>

            {/* Branch details */}
            <fieldset className="space-y-4">
              <legend className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-3">
                Default Branch
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Branch name"
                  id="branchName"
                  placeholder="Main Branch"
                  value={form.branchName}
                  onChange={field("branchName")}
                />
                <FormField
                  label="Branch address"
                  id="branchAddress"
                  placeholder="Addis Ababa"
                  value={form.branchAddress}
                  onChange={field("branchAddress")}
                />
              </div>
            </fieldset>

            {/* Owner details */}
            <fieldset className="space-y-4">
              <legend className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-3">
                Owner Account
              </legend>

              <FormField
                label="Full name"
                id="ownerFullName"
                placeholder="Abel Tadesse"
                required
                value={form.ownerFullName}
                onChange={field("ownerFullName")}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  id="ownerEmail"
                  type="email"
                  placeholder="owner@pharmahub.et"
                  required
                  value={form.ownerEmail}
                  onChange={field("ownerEmail")}
                />
                <FormField
                  label="Password"
                  id="ownerPassword"
                  type="password"
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  value={form.ownerPassword}
                  onChange={field("ownerPassword")}
                />
              </div>
            </fieldset>

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
              className="w-full h-12 rounded-[4px] text-white font-bold text-sm tracking-wide disabled:opacity-60 transition-opacity cursor-pointer"
              style={{
                background: isSubmitting
                  ? "#004253"
                  : "linear-gradient(135deg, #004253, #005b71)",
              }}
            >
              {isSubmitting ? "Creating pharmacy…" : "Create Pharmacy & Owner"}
            </button>
          </form>

          <p className="mt-6 text-center text-on-surface-variant text-sm">
            Already set up?{" "}
            <Link
              href="/login"
              className="text-primary font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/* ── Reusable field ─────────────────────────────────────────────────── */

type FormFieldProps = {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  readOnly?: boolean;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function FormField({
  label,
  id,
  type = "text",
  placeholder,
  required,
  minLength,
  readOnly,
  hint,
  value,
  onChange,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
        >
          {label}
          {required && <span className="text-on-error-container ml-0.5">*</span>}
        </label>
        {hint && (
          <span className="text-[0.65rem] text-outline font-medium">{hint}</span>
        )}
      </div>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        readOnly={readOnly}
        value={value}
        onChange={onChange}
        className={[
          "h-11 px-4 rounded-lg text-on-surface text-sm placeholder:text-outline/60",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow",
          readOnly
            ? "bg-surface-low text-on-surface-variant cursor-default select-all"
            : "bg-surface-lowest",
        ].join(" ")}
        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
      />
    </div>
  );
}
