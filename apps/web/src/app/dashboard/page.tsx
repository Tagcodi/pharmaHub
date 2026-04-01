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
        {
          headers: getAuthHeaders(token),
        }
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
    return <AppLoading message="Loading dashboard…" />;
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
  const maxChartValue = Math.max(1, ...chartData.map((item) => item.value));
  const todayKey = getLocalDayKey(new Date());

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-3">
          <KpiCard
            label="Inventory Value"
            value={`ETB ${formatNumber(metrics.totalInventoryValue)}`}
            valueSize="2.2rem"
            note={
              <span className="flex items-center gap-1 text-xs font-semibold text-on-secondary-container">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 9V3M3 6l3-3 3 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                {metrics.totalUnitsOnHand.toLocaleString("en-US")} units currently on hand
              </span>
            }
            icon={
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-outline/40"
              >
                <path
                  d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
                  strokeLinecap="round"
                />
              </svg>
            }
          />

          <KpiCard
            label="Critical Alerts"
            value={String(metrics.criticalAlertCount)}
            valueColor="#93000a"
            valueSize="2.7rem"
            note={
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={`${metrics.lowStockCount} Low Stock`}
                  tone="danger"
                />
                <StatusBadge
                  label={`${metrics.nearExpiryBatchCount} Near Expiry`}
                  tone="warning"
                />
              </div>
            }
            icon={
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-outline/40"
              >
                <path
                  d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  strokeLinecap="round"
                />
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
              </svg>
            }
          />

          <KpiCard
            label="Catalog Coverage"
            value={`${metrics.registeredMedicines}`}
            valueSize="2.7rem"
            note={
              <span className="text-xs text-outline">
                {metrics.activeBatches} active batches in{" "}
                {overview?.branch.name ?? session.branch?.name ?? "this branch"}
              </span>
            }
            icon={
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-outline/40"
              >
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              </svg>
            }
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
          ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <SurfaceCard className="p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.1rem] font-bold text-on-surface">
                    Weekly Inventory Intake
                  </h2>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    Retail value of stock batches received over the last 7 days
                  </p>
                </div>
                <div className="rounded-full bg-surface-low px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
                  Live branch data
                </div>
              </div>

              {chartData.length === 0 ? (
                <EmptyStateCard
                  compact
                  title="No stock movement yet"
                  description="Receive your first stock batch to start building this activity trend."
                />
              ) : (
                <div className="flex h-[180px] items-end gap-3">
                  {chartData.map((item) => {
                    const percent = (item.value / maxChartValue) * 100;
                    const isToday = item.dayKey === todayKey;

                    return (
                      <div key={item.dayKey} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="flex w-full flex-col justify-end"
                          style={{ height: "152px" }}
                        >
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${percent}%`,
                              minHeight: item.value > 0 ? "10px" : "2px",
                              background: isToday
                                ? "linear-gradient(180deg, #004253, #005b71)"
                                : "rgba(0,66,83,0.15)",
                              transition: "height 0.3s",
                            }}
                            title={`ETB ${formatNumber(item.value)}`}
                          />
                        </div>
                        <span
                          className={[
                            "text-[0.65rem] font-bold uppercase tracking-wider",
                            isToday ? "text-primary" : "text-outline/60",
                          ].join(" ")}
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">
                  High Risk Expiry
                </h2>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  Batches sorted by the earliest expiry date in this branch
                </p>
              </div>

              {overview?.expiryItems.length ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="pb-3">Medicine</th>
                      <th className="pb-3">Batch</th>
                      <th className="pb-3 text-right">Stock</th>
                      <th className="pb-3">Expiry</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.expiryItems.map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                      >
                        <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                          {item.medicineName}
                        </td>
                        <td className="py-3 pr-3">
                          <code className="rounded bg-surface-low px-1.5 py-0.5 text-xs text-on-surface-variant">
                            {item.batchNumber}
                          </code>
                        </td>
                        <td className="py-3 pr-3 text-right text-sm text-on-surface">
                          {item.stock.toLocaleString("en-US")}
                        </td>
                        <td className="py-3 pr-3 text-sm text-on-surface-variant">
                          {formatDate(item.expiryDate)}
                        </td>
                        <td className="py-3">
                          <ExpiryChip status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyStateCard
                  compact
                  title="No active batches yet"
                  description="Expiry monitoring will appear here once stock is received."
                />
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">
                Branch Health
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Live operating picture for {overview?.branch.name ?? session.branch?.name ?? "this branch"}
              </p>

              <div className="mt-5 space-y-4">
                <HealthRow
                  label="Low stock medicines"
                  value={String(metrics.lowStockCount)}
                />
                <HealthRow
                  label="Near expiry batches"
                  value={String(metrics.nearExpiryBatchCount)}
                />
                <HealthRow
                  label="Active batches"
                  value={String(metrics.activeBatches)}
                />
                <HealthRow
                  label="Total units on hand"
                  value={metrics.totalUnitsOnHand.toLocaleString("en-US")}
                />
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[1rem] font-bold text-on-surface">
                    Recent Activity
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Audit-backed operational events
                  </p>
                </div>
              </div>

              {overview?.recentActivity.length ? (
                <div className="mt-5 space-y-4">
                  {overview.recentActivity.map((item) => (
                    <ActivityItem key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title="No recent activity"
                  description="As staff sign in and receive stock, the audit trail will appear here."
                />
              )}
            </SurfaceCard>

            <div
              className="rounded-lg p-6 text-white"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-white/55">
                Quick Actions
              </p>
              <div className="mt-5 space-y-3">
                {session.user.role !== "CASHIER" ? (
                  <>
                    <QuickActionLink href="/medicines/adjust" label="Receive Stock" />
                    <QuickActionLink
                      href="/medicines/adjustments"
                      label="Adjust Stock"
                    />
                    <QuickActionLink href="/medicines/counts" label="Run Stock Count" />
                    <QuickActionLink href="/medicines" label="Review Inventory" />
                  </>
                ) : null}
                {session.user.role === "OWNER" ? (
                  <QuickActionLink href="/users" label="Manage Staff Accounts" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ExpiryChip({ status }: { status: "CRITICAL" | "WARNING" | "NORMAL" }) {
  if (status === "CRITICAL") {
    return <StatusBadge label="Critical" tone="danger" />;
  }

  if (status === "WARNING") {
    return <StatusBadge label="Warning" tone="warning" />;
  }

  return <StatusBadge label="Monitor" tone="success" />;
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

function ActivityItem({
  item,
}: {
  item: DashboardOverviewResponse["recentActivity"][number];
}) {
  const tones = {
    success: "bg-secondary-container text-on-secondary-container",
    info: "bg-surface-low text-on-surface",
    neutral: "bg-surface-low text-on-surface-variant",
    warning: "bg-tertiary-container text-on-tertiary-container",
    danger: "bg-error-container text-on-error-container",
  };

  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tones[item.tone]}`}
      >
        <span className="text-[0.7rem] font-bold uppercase">
          {item.title.slice(0, 2)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-on-surface">{item.title}</p>
          <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-outline">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function QuickActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center justify-between rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/15"
    >
      <span>{label}</span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getLocalDayKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
