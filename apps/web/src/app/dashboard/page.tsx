"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSession() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const data = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSession(data);
    } catch (err) {
      window.localStorage.removeItem(TOKEN_KEY);
      router.replace("/login");
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSession() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      router.replace("/login");
      return;
    }

    setIsRefreshing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const data = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSession(data);
      setSuccessMsg("Session refreshed.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsRefreshing(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  /* ── Loading ─────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader"
            role="status"
            aria-label="Loading session"
          />
          <p className="text-on-surface-variant text-sm font-medium">
            Loading session…
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const initials = session.user.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-surface-low flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-8 h-16"
        style={{
          background: "rgba(247,249,251,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 1px 0 rgba(0,66,83,0.06)",
        }}
      >
        {/* Left: brand + pharmacy */}
        <div className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-[4px] flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <span className="text-white text-xs font-black">P</span>
          </div>
          <div>
            <span className="text-on-surface font-bold text-sm">
              {session.pharmacy.name}
            </span>
            <span className="ml-2 text-outline text-xs">
              /{session.pharmacy.slug}
            </span>
          </div>
        </div>

        {/* Right: sync + user */}
        <div className="flex items-center gap-5">
          {/* Sync indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-on-secondary-container animate-offline" />
            <span className="text-on-surface-variant text-xs font-medium">Online</span>
          </div>

          {/* User avatar */}
          <button
            onClick={signOut}
            title="Sign out"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            {initials}
          </button>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main className="flex-1 px-6 md:px-10 py-10 max-w-6xl mx-auto w-full">

        {/* Hero headline */}
        <div className="mb-10">
          <p className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-2">
            Dashboard
          </p>
          <h1 className="text-[2.75rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
            {session.user.fullName.split(" ")[0]}&#8217;s workspace.
          </h1>
          <p className="mt-2 text-on-surface-variant text-base">
            {session.pharmacy.name}
            {session.branch ? ` · ${session.branch.name}` : ""}
          </p>
        </div>

        {/* ── Stats row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Medicines", value: "—", note: "Coming soon" },
            { label: "Batches Active", value: "—", note: "Coming soon" },
            { label: "Sales Today",    value: "ETB —", note: "Coming soon" },
            { label: "Low Stock",      value: "—", note: "Coming soon" },
          ].map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">

          {/* Session details */}
          <section
            className="rounded-lg bg-surface-lowest p-8"
            style={{ boxShadow: "0 12px 40px rgba(0,66,83,0.08)" }}
          >
            <h2 className="text-[1.1rem] font-bold text-on-surface mb-6">
              Active session
            </h2>

            <div className="space-y-6">
              {/* User */}
              <SessionGroup label="User">
                <p className="text-on-surface font-semibold">{session.user.fullName}</p>
                <p className="text-on-surface-variant text-sm">{session.user.email}</p>
                <div className="mt-1.5">
                  <RoleChip role={session.user.role} />
                </div>
              </SessionGroup>

              {/* Pharmacy */}
              <SessionGroup label="Pharmacy">
                <p className="text-on-surface font-semibold">{session.pharmacy.name}</p>
                <p className="text-on-surface-variant text-sm">
                  Slug:{" "}
                  <code className="bg-surface-low rounded px-1 py-0.5 text-xs">
                    {session.pharmacy.slug}
                  </code>
                </p>
              </SessionGroup>

              {/* Branch */}
              <SessionGroup label="Branch">
                {session.branch ? (
                  <>
                    <p className="text-on-surface font-semibold">{session.branch.name}</p>
                    <p className="text-on-surface-variant text-sm">
                      Code:{" "}
                      <code className="bg-surface-low rounded px-1 py-0.5 text-xs">
                        {session.branch.code}
                      </code>
                    </p>
                  </>
                ) : (
                  <p className="text-on-surface-variant text-sm">No branch assigned</p>
                )}
              </SessionGroup>
            </div>

            {/* Toasts */}
            {successMsg ? (
              <div className="mt-6 px-4 py-3 rounded-lg bg-secondary-container text-on-secondary-container text-sm">
                {successMsg}
              </div>
            ) : null}
            {error ? (
              <div className="mt-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">
                {error}
              </div>
            ) : null}

            {/* Session actions */}
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => void refreshSession()}
                disabled={isRefreshing}
                className="h-10 px-5 rounded-lg bg-surface-low text-on-surface text-sm font-semibold
                  disabled:opacity-50 transition-opacity cursor-pointer hover:bg-surface-high"
              >
                {isRefreshing ? "Refreshing…" : "Refresh Session"}
              </button>
              <button
                onClick={signOut}
                className="h-10 px-5 rounded-lg text-on-surface-variant text-sm font-semibold
                  cursor-pointer hover:text-on-surface transition-colors"
                style={{
                  border: "1px dashed rgba(191,200,204,0.6)",
                }}
              >
                Sign Out
              </button>
            </div>
          </section>

          {/* Right column: quick actions + auth notes */}
          <div className="space-y-4">
            {/* Quick actions */}
            <section
              className="rounded-lg bg-surface-lowest p-6"
              style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
            >
              <h3 className="text-sm font-bold text-on-surface mb-4">Quick actions</h3>
              <div className="space-y-2">
                {[
                  { label: "Inventory", desc: "Manage stock & batches", soon: true },
                  { label: "Sales",     desc: "Process transactions",   soon: true },
                  { label: "Reports",   desc: "Analytics & audit logs", soon: true },
                  { label: "Users",     desc: "Staff management",       soon: true },
                ].map((action) => (
                  <button
                    key={action.label}
                    disabled={action.soon}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg
                      bg-surface-low text-left disabled:opacity-50 cursor-not-allowed
                      hover:bg-surface-high transition-colors group"
                  >
                    <div>
                      <p className="text-on-surface text-sm font-semibold">{action.label}</p>
                      <p className="text-on-surface-variant text-xs">{action.desc}</p>
                    </div>
                    {action.soon && (
                      <span className="text-[0.65rem] font-bold tracking-widest uppercase text-outline px-2 py-1 rounded-full bg-surface-high">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Auth foundation notes */}
            <section
              className="rounded-lg p-6"
              style={{
                background: "rgba(0,66,83,0.04)",
              }}
            >
              <h3 className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-3">
                Auth foundation
              </h3>
              <ul className="space-y-2">
                {[
                  "First-time pharmacy setup with default MAIN branch",
                  "JWT login via email + password",
                  "Protected session endpoint for current user",
                  "Role-based access: OWNER · PHARMACIST · CASHIER",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-on-surface-variant text-xs leading-relaxed"
                  >
                    <span className="w-1 h-1 rounded-full bg-outline/50 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div
      className="rounded-lg bg-surface-lowest p-5"
      style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
    >
      <p className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-1">
        {label}
      </p>
      <p className="text-[2.75rem] font-bold text-on-surface leading-none tracking-[-0.04em]">
        {value}
      </p>
      <p className="text-on-surface-variant text-xs mt-1">{note}</p>
    </div>
  );
}

function SessionGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="inline-block mb-2 text-[0.7rem] font-bold tracking-[0.08em] uppercase text-outline">
        {label}
      </span>
      {children}
    </div>
  );
}

function RoleChip({ role }: { role: string }) {
  const variants: Record<string, { bg: string; text: string }> = {
    OWNER:       { bg: "#cce8d4", text: "#003920" },
    PHARMACIST:  { bg: "#cce8d4", text: "#003920" },
    CASHIER:     { bg: "#ffddb7", text: "#6e3900" },
  };
  const v = variants[role] ?? { bg: "#e0e3e5", text: "#40484c" };

  return (
    <span
      className="inline-flex items-center px-3 py-0.5 rounded-full text-[0.7rem] font-bold tracking-wide uppercase"
      style={{ backgroundColor: v.bg, color: v.text }}
    >
      {role}
    </span>
  );
}
