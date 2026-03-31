"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { TOKEN_KEY, type SessionResponse } from "../lib/api";

/* ── Icons ─────────────────────────────────────────────────────────── */

function Icon({ d, d2 }: { d: string; d2?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const ICONS = {
  dashboard:  "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  inventory:  "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  sales:      "M17 2H7c-1.1 0-2 .9-2 2v16l7-3 7 3V4c0-1.1-.9-2-2-2z",
  alerts:     "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  audit:      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  reports:    "M18 20V10M12 20V4M6 20v-6",
  users:      "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  settings:   "M12 15a3 3 0 100-6 3 3 0 000 6z M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.632 2.401-2.645 1.115L6 4 4 6l1.453 1.787-1.08 2.657L2 11v2l2.401.655L5.516 16.3 4 18l2 2 1.791-1.489 2.616 1.094L11 22h2l.604-2.387 2.651-1.098L18 20l2-2-1.471-1.794 1.098-2.652 2.373-.571V11l-2.378-.605z",
  support:    "M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  plus:       "M12 5v14M5 12h14",
  cloud:      "M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z",
};

/* ── Nav items ──────────────────────────────────────────────────────── */

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",       icon: "dashboard" as const },
  { href: "/medicines", label: "Inventory",        icon: "inventory" as const },
  { href: "/sales",     label: "Sales/POS",        icon: "sales"     as const },
  { href: "/alerts",    label: "Alerts",            icon: "alerts"    as const },
  { href: "/audit",     label: "Audit Log",         icon: "audit"     as const },
  { href: "/reports",   label: "Reports",           icon: "reports"   as const },
  { href: "/users",     label: "User Management",   icon: "users"     as const },
] as const;

/* ── NavItem ────────────────────────────────────────────────────────── */

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors",
        active
          ? "border-l-[3px] border-primary bg-primary/[0.07] text-primary font-semibold -ml-0"
          : "text-on-surface-variant hover:bg-primary/[0.04] border-l-[3px] border-transparent",
      ].join(" ")}
    >
      <Icon d={ICONS[icon]} />
      <span>{label}</span>
    </Link>
  );
}

/* ── Sync status ────────────────────────────────────────────────────── */

function SyncStatus() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-on-surface-variant text-xs font-semibold"
      style={{ background: "rgba(0,66,83,0.06)" }}
    >
      <Icon d={ICONS.cloud} />
      <span className="tracking-wide uppercase text-[0.65rem]">Sync Status:</span>
      <span className="flex items-center gap-1 text-on-secondary-container font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-container" />
        Live
      </span>
    </div>
  );
}

/* ── AppShell ───────────────────────────────────────────────────────── */

type AppShellProps = {
  session: SessionResponse;
  children: ReactNode;
};

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const initials = session.user.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-low">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        className="w-[220px] shrink-0 flex flex-col bg-surface-lowest overflow-y-auto"
        style={{ boxShadow: "1px 0 0 rgba(0,66,83,0.07)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5">
          <div
            className="w-9 h-9 rounded-[6px] flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <span className="text-white text-sm font-black">P</span>
          </div>
          <div>
            <p className="text-on-surface font-bold text-sm leading-none">PharmaHub</p>
            <p className="text-outline text-[0.6rem] tracking-[0.08em] uppercase mt-0.5">
              Sovereign Architect V1.0
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 pt-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
              />
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-1 pt-4">
          <Link
            href="/sales"
            className="flex items-center justify-center gap-2 w-full h-10 rounded text-white text-sm font-bold mb-3"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <Icon d={ICONS.plus} />
            New Transaction
          </Link>
          <button
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded text-sm text-on-surface-variant hover:bg-primary/[0.04] transition-colors border-l-[3px] border-transparent"
            onClick={() => {}}
          >
            <Icon d={ICONS.settings} />
            <span>Settings</span>
          </button>
          <button
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded text-sm text-on-surface-variant hover:bg-primary/[0.04] transition-colors border-l-[3px] border-transparent"
            onClick={() => {}}
          >
            <Icon d={ICONS.support} />
            <span>Support</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header
          className="h-16 shrink-0 flex items-center gap-4 px-6"
          style={{
            background: "rgba(255,255,255,0.90)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 1px 0 rgba(0,66,83,0.06)",
          }}
        >
          {/* Search */}
          <div className="flex-1 max-w-lg relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline/50 pointer-events-none"
              width="15" height="15" viewBox="0 0 16 16" fill="none"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search inventory, sales, or records…"
              className="w-full h-9 pl-9 pr-4 rounded-full bg-surface-low text-on-surface text-sm
                placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
              style={{ boxShadow: "0 1px 3px rgba(0,66,83,0.05)" }}
            />
          </div>

          {/* Right */}
          <div className="flex items-center gap-4">
            <SyncStatus />

            {/* User */}
            <button
              onClick={signOut}
              title="Sign out"
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div className="text-right hidden sm:block">
                <p className="text-on-surface text-xs font-bold leading-none">
                  {session.user.fullName}
                </p>
                <p className="text-outline text-[0.65rem] tracking-wide uppercase mt-0.5">
                  {session.user.role}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                {initials}
              </div>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-surface-low">
          {children}
        </main>
      </div>
    </div>
  );
}
