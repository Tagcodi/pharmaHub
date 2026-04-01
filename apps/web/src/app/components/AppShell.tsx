"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../i18n/I18nProvider";
import { TOKEN_KEY, type SessionResponse } from "../lib/api";

/* ── Icons ─────────────────────────────────────────────────────────── */

function Icon({ d, d2, size = 20 }: { d: string; d2?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  inventory:
    "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  sales:   "M17 2H7c-1.1 0-2 .9-2 2v16l7-3 7 3V4c0-1.1-.9-2-2-2z",
  alerts:  "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  audit:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  reports: "M18 20V10M12 20V4M6 20v-6",
  purchaseOrders:
    "M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m1 8h-6M16 14h-6M10 18H8",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6z M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.632 2.401-2.645 1.115L6 4 4 6l1.453 1.787-1.08 2.657L2 11v2l2.401.655L5.516 16.3 4 18l2 2 1.791-1.489 2.616 1.094L11 22h2l.604-2.387 2.651-1.098L18 20l2-2-1.471-1.794 1.098-2.652 2.373-.571V11l-2.378-.605z",
  support: "M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  plus:    "M12 5v14M5 12h14",
  cloud:   "M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z",
  logout:  "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
};

/* ── Nav config ─────────────────────────────────────────────────────── */

const PRIMARY_NAV = [
  { href: "/dashboard", labelKey: "shell.nav.dashboard", icon: "dashboard" as const },
  { href: "/medicines", labelKey: "shell.nav.inventory", icon: "inventory" as const },
  { href: "/sales", labelKey: "shell.nav.sales", icon: "sales" as const },
  { href: "/alerts", labelKey: "shell.nav.alerts", icon: "alerts" as const },
] as const;

const SECONDARY_NAV = [
  { href: "/purchase-orders", labelKey: "shell.nav.restocking", icon: "purchaseOrders" as const },
  { href: "/audit", labelKey: "shell.nav.audit", icon: "audit" as const },
  { href: "/reports", labelKey: "shell.nav.reports", icon: "reports" as const },
  { href: "/users", labelKey: "shell.nav.users", icon: "users" as const },
] as const;

/* ── NavItem ────────────────────────────────────────────────────────── */

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  active: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "group relative flex items-center gap-3.5 rounded-lg px-3 py-3 text-[0.875rem] font-medium transition-all",
        active
          ? "bg-primary/[0.08] text-primary font-semibold"
          : "text-on-surface-variant hover:bg-primary/[0.04] hover:text-on-surface",
      ].join(" ")}
    >
      {/* Active indicator */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: "#004253" }}
        />
      )}

      <span className={active ? "text-primary" : "text-outline group-hover:text-on-surface-variant transition-colors"}>
        <Icon d={ICONS[icon]} size={20} />
      </span>

      <span className="flex-1 leading-none">{label}</span>

      {badge && (
        <span className="shrink-0 rounded-full bg-error-container text-on-error-container text-[0.6rem] font-bold px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
    </Link>
  );
}

/* ── Section label ──────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[0.6rem] font-bold tracking-[0.1em] uppercase text-outline/60 select-none">
      {children}
    </p>
  );
}

/* ── Divider ────────────────────────────────────────────────────────── */

function Divider() {
  return <div className="mx-3 my-2" style={{ height: 1, background: "rgba(0,66,83,0.07)" }} />;
}

/* ── AppShell ───────────────────────────────────────────────────────── */

type AppShellProps = {
  session: SessionResponse;
  children: ReactNode;
};

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const role = session.user.role;

  const primaryNav = PRIMARY_NAV.filter((item) => {
    if (
      role === "CASHIER" &&
      (item.href === "/medicines" || item.href === "/alerts")
    ) {
      return false;
    }

    return true;
  });

  const secondaryNav = SECONDARY_NAV.filter((item) => {
    if (item.href === "/users") {
      return role === "OWNER";
    }

    if (item.href === "/purchase-orders") {
      return role !== "CASHIER";
    }

    if (item.href === "/audit") {
      return role !== "CASHIER";
    }

    if (item.href === "/reports") {
      return role !== "CASHIER";
    }

    return true;
  });

  const initials = session.user.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  const roleLabel =
    role === "OWNER"
      ? t("shell.role.owner")
      : role === "PHARMACIST"
        ? t("shell.role.pharmacist")
        : t("shell.role.cashier");

  return (
    <div className="flex h-screen overflow-hidden bg-surface-low">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        className="w-[256px] shrink-0 flex flex-col bg-surface-lowest overflow-y-auto"
        style={{ boxShadow: "1px 0 0 rgba(0,66,83,0.07)" }}
      >

        {/* Logo */}
        <div className="px-5 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <span className="text-white text-base font-black">P</span>
            </div>
            <div>
              <p className="text-on-surface font-bold text-[0.95rem] leading-tight">PharmaHub</p>
              <p className="text-outline text-[0.58rem] tracking-[0.1em] uppercase mt-0.5">
                {t("shell.tagline")}
              </p>
            </div>
          </div>
        </div>

        <Divider />

        {/* ── Primary nav ──────────────────────────────────────── */}
        <nav className="px-2.5">
          <SectionLabel>{t("shell.section.workspace")}</SectionLabel>
          <div className="space-y-0.5 mt-0.5">
            {primaryNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={t(item.labelKey)}
                icon={item.icon}
                active={isActive(item.href)}
                badge={item.icon === "alerts" ? undefined : undefined}
              />
            ))}
          </div>
        </nav>

        <Divider />

        {/* ── Secondary nav ────────────────────────────────────── */}
        <nav className="px-2.5">
          <SectionLabel>{t("shell.section.management")}</SectionLabel>
          <div className="space-y-0.5 mt-0.5">
            {secondaryNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={t(item.labelKey)}
                icon={item.icon}
                active={isActive(item.href)}
              />
            ))}
          </div>
        </nav>

        {/* ── Push bottom content down ─────────────────────────── */}
        <div className="flex-1" />

        {/* ── New Transaction CTA ──────────────────────────────── */}
        <div className="px-3 pt-2">
          <Link
            href="/sales"
            className="flex items-center justify-center gap-2.5 w-full h-12 rounded-lg text-white text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <Icon d={ICONS.plus} size={16} />
            {t("shell.action.newTransaction")}
          </Link>
        </div>

        <Divider />

        {/* ── Utility links ────────────────────────────────────── */}
        <nav className="px-2.5">
          <div className="mb-3 px-1">
            <LanguageSwitcher compact />
          </div>
          <div className="space-y-0.5">
            <button
              className="flex items-center gap-3.5 w-full px-3 py-3 rounded-lg text-[0.875rem] font-medium text-on-surface-variant hover:bg-primary/[0.04] hover:text-on-surface transition-colors cursor-pointer"
              onClick={() => {}}
            >
              <span className="text-outline">
                <Icon d={ICONS.settings} size={20} />
              </span>
              {t("shell.action.settings")}
            </button>
            <button
              className="flex items-center gap-3.5 w-full px-3 py-3 rounded-lg text-[0.875rem] font-medium text-on-surface-variant hover:bg-primary/[0.04] hover:text-on-surface transition-colors cursor-pointer"
              onClick={() => {}}
            >
              <span className="text-outline">
                <Icon d={ICONS.support} size={20} />
              </span>
              {t("shell.action.support")}
            </button>
          </div>
        </nav>

        <Divider />

        {/* ── User card ────────────────────────────────────────── */}
        <div className="px-3 pb-5 pt-1">
          <div
            className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-surface-low transition-colors group"
            onClick={signOut}
            title={t("shell.action.signOut")}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-on-surface text-xs font-semibold leading-tight truncate">
                {session.user.fullName}
              </p>
              <p className="text-outline text-[0.65rem] tracking-wide uppercase mt-0.5 truncate">
                {roleLabel}
              </p>
            </div>
            <span className="text-outline/40 group-hover:text-outline transition-colors shrink-0">
              <Icon d={ICONS.logout} size={15} />
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top header */}
        <header
          className="h-[60px] shrink-0 flex items-center gap-5 px-6"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 1px 0 rgba(0,66,83,0.07)",
          }}
        >
          {/* Left — pharmacy + branch context */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-on-surface text-sm font-bold leading-none">
              {session.pharmacy.name}
            </span>
            {session.branch && (
              <>
                <span className="text-outline/40 text-sm">/</span>
                <span className="flex items-center gap-1 text-on-surface-variant text-xs font-medium">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {session.branch.name}
                </span>
              </>
            )}
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-outline/15 shrink-0" />

          {/* Center — search (takes all remaining space) */}
          <div className="flex-1 relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline/40 pointer-events-none"
              width="14" height="14" viewBox="0 0 16 16" fill="none"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder={t("shell.searchPlaceholder")}
              className="w-full h-9 pl-9 pr-4 rounded-full bg-surface-low text-on-surface text-sm
                placeholder:text-outline/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
              style={{ boxShadow: "0 1px 3px rgba(0,66,83,0.04)" }}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-outline/15 shrink-0" />

          {/* Right — sync + notifications + user */}
          <div className="flex items-center gap-3 shrink-0">
            <SyncStatus />

            {/* Notification bell */}
            <button
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-surface-low hover:text-on-surface transition-colors cursor-pointer"
              title={t("shell.action.notifications")}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {/* Badge */}
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-on-error-container border-2 border-white" />
            </button>

            {/* Separator */}
            <div className="w-px h-5 bg-outline/15" />

            {/* User identity card */}
            <button
              onClick={signOut}
              title={t("shell.action.signOut")}
              className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-surface-low transition-colors cursor-pointer group"
            >
              <div className="text-right">
                <p className="text-on-surface text-xs font-bold leading-tight">
                  {session.user.fullName}
                </p>
                <p className="text-outline text-[0.6rem] tracking-widest uppercase mt-0.5">
                  {roleLabel}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 group-hover:opacity-90 transition-opacity"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                {initials}
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-surface-low">
          {children}
        </main>
      </div>
    </div>
  );
}

function SyncStatus() {
  const { t } = useI18n();

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold"
      style={{ background: "rgba(0,66,83,0.06)" }}
    >
      <Icon d={ICONS.cloud} size={15} />
      <span className="tracking-wide uppercase text-[0.6rem] text-on-surface-variant">
        {t("shell.sync")}:
      </span>
      <span className="flex items-center gap-1.5 text-on-secondary-container font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-container" />
        {t("shell.live")}
      </span>
    </div>
  );
}
