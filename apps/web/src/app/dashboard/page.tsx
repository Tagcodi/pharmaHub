"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import { useI18n } from "../i18n/I18nProvider";
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  formatNumber,
  formatRelativeTime,
} from "../i18n/format";
import {
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type DashboardOverviewResponse,
  type SessionResponse,
} from "../lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = DASHBOARD_COPY[locale] as (typeof DASHBOARD_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const sessionData = await fetchJson<SessionResponse>("/auth/me", {
        headers: getAuthHeaders(token),
      });

      setSession(sessionData);

      const overviewData = await fetchJson<DashboardOverviewResponse>(
        "/dashboard/overview",
        { headers: getAuthHeaders(token) }
      );

      setOverview(overviewData);
    } catch (err) {
      const message = formatError(err);

      if (message.toLowerCase().includes("missing bearer token")) {
        window.localStorage.removeItem("pharmahub.accessToken");
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <AppLoading message={text.loadingDashboard} />;
  }

  if (!session) {
    return null;
  }

  const metrics = overview?.metrics ?? {
    totalInventoryValue: 0,
    registeredMedicines: 0,
    activeBatches: 0,
    lowStockCount: 0,
    nearExpiryBatchCount: 0,
    criticalAlertCount: 0,
    totalUnitsOnHand: 0,
  };

  const chartData = overview?.weeklyInventoryValue ?? [];
  const maxChartValue = Math.max(1, ...chartData.map((d) => d.value));
  const todayKey = getLocalDayKey(new Date());
  const branchName = overview?.branch.name ?? session.branch?.name ?? text.thisBranch;
  const greeting = getGreeting(locale, text);

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">

        {/* ── Top section (hero + KPIs) ─────────────────────────────────── */}
        <div>

        {/* Page hero */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
              {formatDateLong(new Date(), locale)}
            </p>
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {greeting},{" "}
              <span className="text-primary">
                {session.user.fullName.split(" ")[0]}
              </span>
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {text.operationalOverviewFor}{" "}
              <span className="font-semibold text-on-surface">{branchName}</span>
            </p>
          </div>

          {metrics.criticalAlertCount > 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-error-container px-4 py-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ba1a1a"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
              </svg>
              <p className="text-sm font-bold text-on-error-container">
                {text.criticalAlertBanner
                  .replace("{count}", formatNumber(metrics.criticalAlertCount, locale))
                  .replace(
                    "{suffix}",
                    metrics.criticalAlertCount !== 1 ? text.pluralSuffix : ""
                  )}
              </p>
              <Link
                href="/medicines"
                className="ml-1 text-xs font-bold text-on-error-container underline underline-offset-2 opacity-70 hover:opacity-100"
              >
                {text.reviewArrow}
              </Link>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-error-container px-4 py-3.5 text-sm text-on-error-container">
            <svg
              className="shrink-0"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        ) : null}

        {/* KPI strip */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={text.inventoryValue}
            value={`ETB ${formatCurrency(metrics.totalInventoryValue, locale)}`}
            valueSize="1.9rem"
            note={
              <span className="flex items-center gap-1 font-semibold text-on-secondary-container">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 9V3M3 6l3-3 3 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                {formatNumber(metrics.totalUnitsOnHand, locale)} {text.unitsOnHand}
              </span>
            }
            icon={
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            }
          />

          <KpiCard
            label={text.criticalAlerts}
            value={String(metrics.criticalAlertCount)}
            valueColor={metrics.criticalAlertCount > 0 ? "#ba1a1a" : "#191c1e"}
            valueSize="2.4rem"
            note={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge
                  label={`${formatNumber(metrics.lowStockCount, locale)} ${text.lowStock}`}
                  tone="danger"
                />
                <StatusBadge
                  label={`${formatNumber(metrics.nearExpiryBatchCount, locale)} ${text.nearExpiry}`}
                  tone="warning"
                />
              </div>
            }
            icon={
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  metrics.criticalAlertCount > 0
                    ? "bg-error-container"
                    : "bg-surface-low"
                }`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={metrics.criticalAlertCount > 0 ? "#ba1a1a" : "#70787d"}
                  strokeWidth="1.8"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                </svg>
              </div>
            }
          />

          <KpiCard
            label={text.medicinesInCatalog}
            value={String(metrics.registeredMedicines)}
            valueSize="2.4rem"
            note={`${formatNumber(metrics.activeBatches, locale)} ${text.activeBatches}`}
            icon={
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary-container">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#386a20"
                  strokeWidth="1.8"
                >
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                </svg>
              </div>
            }
          />

          <KpiCard
            label={text.unitsOnHandTitle}
            value={formatNumber(metrics.totalUnitsOnHand, locale)}
            valueSize="2.4rem"
            note={text.acrossAllActiveBatches}
            icon={
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tertiary-fixed/40">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b5e45"
                  strokeWidth="1.8"
                >
                  <rect x="1" y="3" width="15" height="13" rx="2" />
                  <path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </div>
            }
          />
        </div>

        </div>{/* end top section */}

        {/* ── Two-column body — grid stretches both cols to equal height ── */}
        <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-[1fr_340px]">

          {/* Left column */}
          <div className="space-y-6">

            {/* Weekly intake chart */}
            <SurfaceCard className="overflow-hidden">
              <div
                className="flex flex-wrap items-center justify-between gap-4 px-7 py-5"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <div>
                  <h2 className="text-[1.05rem] font-bold text-on-surface">
                    {text.weeklyInventoryIntake}
                  </h2>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    {text.weeklyInventoryDescription}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    />
                    {text.today}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/15" />
                    {text.priorDays}
                  </span>
                </div>
              </div>

              <div className="px-7 pb-7 pt-5">
                {chartData.length === 0 ? (
                  <EmptyStateCard
                    compact
                    title={text.noStockMovement}
                    description={text.noStockMovementDescription}
                  />
                ) : (
                  <>
                    <div className="mb-2 flex justify-between px-1">
                      <span className="text-[0.6rem] font-bold uppercase tracking-widest text-outline/50">
                        {text.etb}
                      </span>
                      <span className="text-[0.6rem] font-semibold text-outline/50">
                        {formatCurrency(maxChartValue, locale)}
                      </span>
                    </div>

                    <div className="relative">
                      {[100, 66, 33].map((pct) => (
                        <div
                          key={pct}
                          className="pointer-events-none absolute inset-x-0"
                          style={{
                            bottom: `${(pct / 100) * 200}px`,
                            borderTop: "1px dashed rgba(0,66,83,0.07)",
                          }}
                        />
                      ))}

                      <div className="flex h-[200px] items-end gap-2.5">
                        {chartData.map((item) => {
                          const pct = (item.value / maxChartValue) * 100;
                          const isToday = item.dayKey === todayKey;

                          return (
                            <div
                              key={item.dayKey}
                              className="group relative flex flex-1 flex-col items-center gap-2"
                            >
                              {item.value > 0 ? (
                                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 text-[0.6rem] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  ETB {formatCurrency(item.value, locale)}
                                </div>
                              ) : null}

                              <div
                                className="flex w-full flex-col justify-end"
                                style={{ height: "168px" }}
                              >
                                <div
                                  className="w-full transition-all duration-300"
                                  style={{
                                    height: `${pct}%`,
                                    minHeight: item.value > 0 ? "12px" : "3px",
                                    background: isToday
                                      ? "linear-gradient(180deg, #004253, #005b71)"
                                      : "rgba(0,66,83,0.14)",
                                    borderRadius: "6px 6px 2px 2px",
                                  }}
                                />
                              </div>

                              <span
                                className={[
                                  "text-[0.63rem] font-bold uppercase tracking-wider",
                                  isToday ? "text-primary" : "text-outline/60",
                                ].join(" ")}
                              >
                                {item.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </SurfaceCard>

            {/* Expiry risk table */}
            <SurfaceCard className="overflow-hidden">
              <div
                className="flex flex-wrap items-center justify-between gap-4 px-7 py-5"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <div>
                  <h2 className="text-[1.05rem] font-bold text-on-surface">
                    {text.highRiskExpiry}
                  </h2>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    {text.highRiskExpiryDescription}
                  </p>
                </div>
                {overview?.expiryItems.some((i) => i.status === "CRITICAL") ? (
                  <StatusBadge
                    label={`${formatNumber(overview.expiryItems.filter((i) => i.status === "CRITICAL").length, locale)} ${text.critical}`}
                    tone="danger"
                  />
                ) : null}
              </div>

              {overview?.expiryItems.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr
                        className="text-[0.63rem] font-bold uppercase tracking-[0.08em] text-outline"
                        style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                      >
                        <th className="px-7 py-3">{text.medicine}</th>
                        <th className="px-3 py-3">{text.batch}</th>
                        <th className="px-3 py-3 text-right">{text.stock}</th>
                        <th className="px-3 py-3">{text.expiry}</th>
                        <th className="px-3 py-3 text-right">{text.daysLeft}</th>
                        <th className="px-7 py-3">{text.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.expiryItems.map((item) => {
                        const daysLeft = getDaysUntil(item.expiryDate);
                        const rowHover =
                          item.status === "CRITICAL"
                            ? "hover:bg-error-container/20"
                            : item.status === "WARNING"
                              ? "hover:bg-tertiary-fixed/20"
                              : "hover:bg-surface-low";

                        return (
                          <tr
                            key={item.id}
                            className={`group transition-colors ${rowHover}`}
                            style={{ borderBottom: "1px solid rgba(0,66,83,0.05)" }}
                          >
                            <td className="px-7 py-3.5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="shrink-0 rounded-full"
                                  style={{
                                    width: "3px",
                                    height: "28px",
                                    background:
                                      item.status === "CRITICAL"
                                        ? "#ba1a1a"
                                        : item.status === "WARNING"
                                          ? "#6b5e45"
                                          : "#386a20",
                                  }}
                                />
                                <span className="text-sm font-semibold text-on-surface">
                                  {item.medicineName}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3.5">
                              <code className="rounded-md bg-surface-low px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                                {item.batchNumber}
                              </code>
                            </td>
                            <td className="px-3 py-3.5 text-right text-sm font-semibold text-on-surface">
                              {formatNumber(item.stock, locale)}
                            </td>
                            <td className="px-3 py-3.5 text-sm text-on-surface-variant">
                              {formatDate(item.expiryDate, locale)}
                            </td>
                            <td className="px-3 py-3.5 text-right">
                              <span
                                className={`text-sm font-bold ${
                                  daysLeft <= 0
                                    ? "text-on-error-container"
                                    : daysLeft <= 30
                                      ? "text-[#ba1a1a]"
                                      : daysLeft <= 90
                                        ? "text-[#6b5e45]"
                                        : "text-on-surface"
                                }`}
                              >
                                {daysLeft <= 0 ? text.expired : text.daysShort.replace("{count}", formatNumber(daysLeft, locale))}
                              </span>
                            </td>
                            <td className="px-7 py-3.5">
                              <ExpiryChip status={item.status} text={text} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-7 py-6">
                  <EmptyStateCard
                    compact
                    title={text.noActiveBatches}
                    description={text.noActiveBatchesDescription}
                  />
                </div>
              )}
            </SurfaceCard>
          </div>

          {/* Right column — flex-col so activity card can grow to fill height */}
          <div className="flex flex-col gap-6">

            {/* Branch health stat grid */}
            <SurfaceCard className="overflow-hidden">
              <div
                className="px-6 py-5"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <h2 className="text-[1rem] font-bold text-on-surface">
                  {text.branchHealth}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.livePictureFor} {branchName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-px bg-black/[0.04]">
                <HealthTile
                  label={text.lowStock}
                  value={String(metrics.lowStockCount)}
                  tone={metrics.lowStockCount > 0 ? "danger" : "neutral"}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                      <polyline points="5 12 12 5 19 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
                <HealthTile
                  label={text.nearExpiry}
                  value={String(metrics.nearExpiryBatchCount)}
                  tone={metrics.nearExpiryBatchCount > 0 ? "warning" : "neutral"}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
                <HealthTile
                  label={text.activeBatches}
                  value={String(metrics.activeBatches)}
                  tone="success"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
                <HealthTile
                  label={text.totalUnits}
                  value={formatNumber(metrics.totalUnitsOnHand, locale)}
                  tone="neutral"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                    </svg>
                  }
                />
              </div>
            </SurfaceCard>

            {/* Recent activity feed — grows to fill remaining right-column height */}
            <SurfaceCard className="flex flex-1 flex-col overflow-hidden">
              <div
                className="px-6 py-5"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <h2 className="text-[1rem] font-bold text-on-surface">
                  {text.recentActivity}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.auditBackedEvents}
                </p>
              </div>

              {overview?.recentActivity.length ? (
                <div className="divide-y divide-black/[0.04]">
                  {overview.recentActivity.map((item) => (
                    <ActivityItem key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="px-6 py-6">
                  <EmptyStateCard
                    compact
                    title={text.noRecentActivity}
                    description={text.noRecentActivityDescription}
                  />
                </div>
              )}
            </SurfaceCard>

            {/* Quick actions */}
            <div
              className="overflow-hidden rounded-2xl"
              style={{ background: "linear-gradient(135deg, #004253 0%, #005b71 100%)" }}
            >
              <div
                className="px-6 py-5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-white/50">
                  {text.quickActions}
                </p>
                <p className="mt-1 text-sm font-semibold text-white/80">
                  {text.jumpToCommonWorkflows}
                </p>
              </div>
              <div className="space-y-2 p-4">
                {session.user.role !== "CASHIER" ? (
                  <>
                    <QuickActionLink
                      href="/medicines/adjust"
                      label={text.receiveStock}
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
                        </svg>
                      }
                    />
                    <QuickActionLink
                      href="/medicines/adjustments"
                      label={text.adjustStock}
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      }
                    />
                    <QuickActionLink
                      href="/medicines"
                      label={text.reviewInventory}
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      }
                    />
                  </>
                ) : null}
                <QuickActionLink
                  href="/sales"
                  label={text.openPosSales}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.97-1.67L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
                {session.user.role === "OWNER" ? (
                  <QuickActionLink
                    href="/users"
                    label={text.manageStaff}
                    icon={
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
                      </svg>
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExpiryChip({
  status,
  text,
}: {
  status: "CRITICAL" | "WARNING" | "NORMAL";
  text: (typeof DASHBOARD_COPY)["en"];
}) {
  if (status === "CRITICAL") return <StatusBadge label={text.critical} tone="danger" />;
  if (status === "WARNING") return <StatusBadge label={text.warning} tone="warning" />;
  return <StatusBadge label={text.stable} tone="success" />;
}

function HealthTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "danger" | "warning" | "success" | "neutral";
  icon: React.ReactNode;
}) {
  const iconStyle = {
    danger: "bg-error-container text-on-error-container",
    warning: "bg-tertiary-fixed/50 text-on-tertiary-fixed-variant",
    success: "bg-secondary-container text-on-secondary-container",
    neutral: "bg-surface-low text-on-surface-variant",
  }[tone];

  return (
    <div className="flex flex-col gap-3 bg-white p-5">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconStyle}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-outline">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function ActivityItem({
  item,
  locale,
}: {
  item: DashboardOverviewResponse["recentActivity"][number];
  locale: "en" | "am" | "om";
}) {
  const iconConfig = {
    success: { bg: "bg-secondary-container", color: "text-on-secondary-container" },
    info: { bg: "bg-primary/8", color: "text-primary" },
    neutral: { bg: "bg-surface-low", color: "text-on-surface-variant" },
    warning: { bg: "bg-tertiary-fixed/50", color: "text-on-tertiary-fixed-variant" },
    danger: { bg: "bg-error-container", color: "text-on-error-container" },
  };

  const categoryIcon: Record<string, React.ReactNode> = {
    Inventory: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
    Sales: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
      </svg>
    ),
    Access: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
      </svg>
    ),
    Users: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    Catalog: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeLinecap="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
  };

  const { bg, color } = iconConfig[item.tone];

  return (
    <div className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-surface-low">
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg} ${color}`}
      >
        {categoryIcon[item.category] ?? (
          <span className="text-[0.7rem] font-bold uppercase">
            {item.title.slice(0, 2)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-on-surface">{item.title}</p>
            <p className="text-[0.65rem] font-semibold text-outline">
              {item.actor} · {item.category}
            </p>
          </div>
          <span className="shrink-0 text-[0.62rem] uppercase tracking-wide text-outline">
            {formatRelativeTime(item.createdAt, locale)}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function QuickActionLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center gap-3 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/18"
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0 opacity-50"
      >
        <path
          d="M4 10l6-6M5 4h5v5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function getLocalDayKey(value: Date) {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDaysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function getGreeting(
  locale: "en" | "am" | "om",
  text: (typeof DASHBOARD_COPY)["en"]
) {
  const h = new Date().getHours();
  if (h < 12) return text.goodMorning;
  if (h < 17) return text.goodAfternoon;
  return text.goodEvening;
}

const DASHBOARD_COPY = {
  en: {
    loadingDashboard: "Loading dashboard…",
    thisBranch: "this branch",
    operationalOverviewFor: "Operational overview for",
    criticalAlertBanner: "{count} critical alert{suffix} require attention",
    pluralSuffix: "s",
    reviewArrow: "Review →",
    inventoryValue: "Inventory Value",
    unitsOnHand: "units on hand",
    criticalAlerts: "Critical Alerts",
    lowStock: "Low Stock",
    nearExpiry: "Near Expiry",
    medicinesInCatalog: "Medicines in Catalog",
    activeBatches: "active batches",
    unitsOnHandTitle: "Units on Hand",
    acrossAllActiveBatches: "Across all active batches",
    weeklyInventoryIntake: "Weekly Inventory Intake",
    weeklyInventoryDescription:
      "Retail value of stock batches received over the last 7 days",
    today: "Today",
    priorDays: "Prior days",
    noStockMovement: "No stock movement yet",
    noStockMovementDescription:
      "Receive your first stock batch to start building this activity trend.",
    etb: "ETB",
    highRiskExpiry: "High-Risk Expiry",
    highRiskExpiryDescription:
      "Batches sorted by earliest expiry so you can act before stock becomes unfit for sale.",
    critical: "Critical",
    medicine: "Medicine",
    batch: "Batch",
    stock: "Stock",
    expiry: "Expiry",
    daysLeft: "Days Left",
    status: "Status",
    expired: "Expired",
    daysShort: "{count}d",
    noActiveBatches: "No active batches yet",
    noActiveBatchesDescription:
      "Expiry monitoring will appear here once stock is received.",
    branchHealth: "Branch Health",
    livePictureFor: "Live picture for",
    totalUnits: "Total Units",
    recentActivity: "Recent Activity",
    auditBackedEvents: "Audit-backed operational events",
    noRecentActivity: "No recent activity",
    noRecentActivityDescription:
      "As staff sign in and receive stock, the audit trail will appear here.",
    quickActions: "Quick Actions",
    jumpToCommonWorkflows: "Jump to common workflows",
    receiveStock: "Receive Stock",
    adjustStock: "Adjust Stock",
    reviewInventory: "Review Inventory",
    openPosSales: "Open POS / Sales",
    manageStaff: "Manage Staff",
    warning: "Warning",
    stable: "Stable",
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
  },
  am: {
    loadingDashboard: "ዳሽቦርዱ በመጫን ላይ…",
    thisBranch: "ይህ ቅርንጫፍ",
    operationalOverviewFor: "የክወና አጠቃላይ እይታ ለ",
    criticalAlertBanner: "{count} ከባድ ማንቂያ{suffix} ትኩረት ይፈልጋሉ",
    pluralSuffix: "ዎች",
    reviewArrow: "ገምግም →",
    inventoryValue: "የእቃ ዋጋ",
    unitsOnHand: "በእጅ ያሉ ዩኒቶች",
    criticalAlerts: "ከባድ ማንቂያዎች",
    lowStock: "ዝቅተኛ እቃ",
    nearExpiry: "በቅርብ ማብቂያ",
    medicinesInCatalog: "በካታሎግ ያሉ መድሃኒቶች",
    activeBatches: "ንቁ ባቾች",
    unitsOnHandTitle: "በእጅ ያሉ ዩኒቶች",
    acrossAllActiveBatches: "በሁሉም ንቁ ባቾች ላይ",
    weeklyInventoryIntake: "የሳምንቱ የእቃ መግቢያ",
    weeklyInventoryDescription:
      "ባለፉት 7 ቀናት የተቀበሉ የእቃ ባቾች የመሸጫ ዋጋ",
    today: "ዛሬ",
    priorDays: "ከዚህ በፊት ቀናት",
    noStockMovement: "እስካሁን የእቃ እንቅስቃሴ የለም",
    noStockMovementDescription:
      "ይህን አቅጣጫ ለመጀመር የመጀመሪያውን የእቃ ባች ይቀበሉ።",
    etb: "ETB",
    highRiskExpiry: "ከፍተኛ አደጋ ያለው ማብቂያ",
    highRiskExpiryDescription:
      "ከሽያጭ በፊት እቃው እንዳይበላሽ ባቾች በቅድሚያ ማብቂያ ተስተካክለው ተደርደረዋል።",
    critical: "ከባድ",
    medicine: "መድሃኒት",
    batch: "ባች",
    stock: "እቃ",
    expiry: "ማብቂያ",
    daysLeft: "የቀሩ ቀናት",
    status: "ሁኔታ",
    expired: "አልቋል",
    daysShort: "{count}ቀ",
    noActiveBatches: "ንቁ ባቾች እስካሁን የሉም",
    noActiveBatchesDescription:
      "እቃ ከተቀበሉ በኋላ የማብቂያ ክትትል እዚህ ይታያል።",
    branchHealth: "የቅርንጫፍ ጤና",
    livePictureFor: "የቀጥታ ሁኔታ ለ",
    totalUnits: "ጠቅላላ ዩኒቶች",
    recentActivity: "የቅርብ እንቅስቃሴ",
    auditBackedEvents: "በኦዲት የተደገፉ የክወና ክስተቶች",
    noRecentActivity: "የቅርብ እንቅስቃሴ የለም",
    noRecentActivityDescription:
      "ሰራተኞች ሲገቡ እና እቃ ሲቀበሉ የኦዲት መዝገቡ እዚህ ይታያል።",
    quickActions: "ፈጣን እርምጃዎች",
    jumpToCommonWorkflows: "ወደ ተደጋጋሚ የስራ ፍሰቶች ይሂዱ",
    receiveStock: "እቃ ተቀበል",
    adjustStock: "እቃ አስተካክል",
    reviewInventory: "እቃን ገምግም",
    openPosSales: "POS / ሽያጭ ክፈት",
    manageStaff: "ሰራተኞችን አስተዳድር",
    warning: "ማስጠንቀቂያ",
    stable: "የተረጋጋ",
    goodMorning: "እንደምን አደሩ",
    goodAfternoon: "እንደምን ዋሉ",
    goodEvening: "እንደምን አመሹ",
  },
  om: {
    loadingDashboard: "Daashboordiin fe'amaa jira…",
    thisBranch: "damee kana",
    operationalOverviewFor: "Ilaalcha hojii waliigalaa kan",
    criticalAlertBanner: "Akeekkachiisi cimaa {count}x{suffix} xiyyeeffannoo barbaada",
    pluralSuffix: "",
    reviewArrow: "Ilaali →",
    inventoryValue: "Gatii Kuusaa",
    unitsOnHand: "yuunitii harkatti jiran",
    criticalAlerts: "Akeekkachiisota Cimaa",
    lowStock: "Kuusaa Gadi Aanaa",
    nearExpiry: "Xumuramuu Dhiyaataa",
    medicinesInCatalog: "Qorichoota Kaataalogii",
    activeBatches: "baachiiwwan hojii irra jiran",
    unitsOnHandTitle: "Yuunitii Harkatti Jiran",
    acrossAllActiveBatches: "Baachiiwwan hojii irra jiran hunda keessatti",
    weeklyInventoryIntake: "Galmee Kuusaa Torbanichaa",
    weeklyInventoryDescription:
      "Gatii gurgurtaa baachiiwwan kuusaa guyyaa 7 darban keessatti fudhataman",
    today: "Har'a",
    priorDays: "Guyyoota darban",
    noStockMovement: "Ammaaf sochiin kuusaa hin jiru",
    noStockMovementDescription:
      "Tartiiba hojii kana jalqabuuf baachii kuusaa keessan isa jalqabaa fudhadhaa.",
    etb: "ETB",
    highRiskExpiry: "Xumuramuu Balaa Olaanaa",
    highRiskExpiryDescription:
      "Baachiileen xumura isaanii dursa irratti tartiibaan tarreeffamanii jiru akka kuusaan gurgurtaaf hin miidhamneef.",
    critical: "Cimaa",
    medicine: "Qoricha",
    batch: "Baachii",
    stock: "Kuusaa",
    expiry: "Xumuramuu",
    daysLeft: "Guyyoota Hafan",
    status: "Haala",
    expired: "Xumurameera",
    daysShort: "{count}g",
    noActiveBatches: "Baachiiwwan hojii irra jiran hin jiran",
    noActiveBatchesDescription:
      "Yeroo kuusaan fudhatamu to'annoon xumuramuu asitti mul'ata.",
    branchHealth: "Fayya Damaa",
    livePictureFor: "Haala yeroo ammaa kan",
    totalUnits: "Yuunitii Waliigalaa",
    recentActivity: "Sochii Yeroo Dhihoo",
    auditBackedEvents: "Taateewwan hojii kan odiitiin deeggaraman",
    noRecentActivity: "Sochiin yeroo dhiyoo hin jiru",
    noRecentActivityDescription:
      "Yeroo hojjettoonni seenan fi kuusaa fudhatan galmeen odiitii asitti mul'ata.",
    quickActions: "Tarkaanfiiwwan Ariifataa",
    jumpToCommonWorkflows: "Gara hojiiwwan yeroo baay'ee hojjetamanitti ce'i",
    receiveStock: "Kuusaa Fudhadhu",
    adjustStock: "Kuusaa Sirreessi",
    reviewInventory: "Kuusaa Ilaali",
    openPosSales: "POS / Gurgurtaa Bani",
    manageStaff: "Hojjettoota Bulchi",
    warning: "Akeekkachiisa",
    stable: "Tasgabbaa'aa",
    goodMorning: "Akkam bulte",
    goodAfternoon: "Akkam oolte",
    goodEvening: "Akkam galgaloofte",
  },
} as const;
