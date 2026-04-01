"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type AlertsOverviewResponse,
  type SessionResponse,
} from "../lib/api";

export default function AlertsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [overview, setOverview] = useState<AlertsOverviewResponse | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const sessionData = await fetchJson<SessionResponse>("/auth/me", {
        headers: getAuthHeaders(token),
      });

      if (sessionData.user.role === "CASHIER") {
        router.replace("/dashboard");
        return;
      }

      const overviewData = await fetchJson<AlertsOverviewResponse>(
        "/alerts/overview",
        {
          headers: getAuthHeaders(token),
        }
      );

      setSession(sessionData);
      setOverview(overviewData);
      setError(null);
    } catch (err) {
      const message = formatError(err);

      if (message.toLowerCase().includes("missing bearer token")) {
        window.localStorage.removeItem(TOKEN_KEY);
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const query = search.trim().toLowerCase();
  const lowStockMedicines = useMemo(() => {
    const medicines = overview?.lowStockMedicines ?? [];

    return medicines.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(query) ||
        (item.genericName ?? "").toLowerCase().includes(query) ||
        (item.currentBatchNumber ?? "").toLowerCase().includes(query)
      );
    });
  }, [overview?.lowStockMedicines, query]);

  const expiryBatches = useMemo(() => {
    const items = overview?.expiryBatches ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.medicineName.toLowerCase().includes(query) ||
        (item.genericName ?? "").toLowerCase().includes(query) ||
        item.batchNumber.toLowerCase().includes(query)
      );
    });
  }, [overview?.expiryBatches, query]);

  const inventorySignals = useMemo(() => {
    const items = overview?.inventorySignals ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.medicineName.toLowerCase().includes(query) ||
        item.batchNumber.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query)
      );
    });
  }, [overview?.inventorySignals, query]);

  const salesSignals = useMemo(() => {
    const items = overview?.salesSignals ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.saleNumber.toLowerCase().includes(query) ||
        (item.reason ?? "").toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query)
      );
    });
  }, [overview?.salesSignals, query]);

  if (isLoading) {
    return <AppLoading message="Loading branch alerts…" />;
  }

  if (!session) {
    return null;
  }

  const metrics = overview?.metrics ?? {
    totalAlerts: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    lowStockCount: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    suspectedLossCount: 0,
    cycleCountShortageCount: 0,
    voidedSaleCount: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1360px] px-8 py-8">
        <div className="mb-7 flex flex-wrap items-start gap-5">
          <div>
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              Alert Center
            </h1>
            <p className="mt-2 max-w-[720px] text-sm text-on-surface-variant">
              Live exception monitoring for expiry pressure, low stock, suspicious
              loss, and sale reversals across {overview?.branch.name ?? "this branch"}.
            </p>
          </div>

          <div className="relative ml-auto min-w-[280px] flex-1 max-w-[380px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline/50"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              placeholder="Search medicine, batch, or sale…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label="Total Alerts"
            value={String(metrics.totalAlerts)}
            note={`${metrics.warningAlerts} warning / ${metrics.criticalAlerts} critical`}
          />
          <KpiCard
            label="Critical Risk"
            value={String(metrics.criticalAlerts)}
            valueColor="#93000a"
            note="Immediate review recommended"
          />
          <KpiCard
            label="Low Stock"
            value={String(metrics.lowStockCount)}
            valueColor="#93000a"
            note={`${metrics.cycleCountShortageCount} recent count shortages`}
          />
          <KpiCard
            label="Expiry Pressure"
            value={String(metrics.expiringSoonCount)}
            valueColor="#6e3900"
            note={`${metrics.expiredCount} batches already expired`}
          />
          <KpiCard
            label="Reversal Signals"
            value={String(metrics.voidedSaleCount)}
            note={`${metrics.suspectedLossCount} suspected loss events`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title="Low Stock Medicines"
              description="Batches that need replenishment or closer count supervision."
              actionHref="/medicines"
              actionLabel="Open Inventory"
            />

            {lowStockMedicines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="px-6 pb-3">Medicine</th>
                      <th className="pb-3">Batch</th>
                      <th className="pb-3 text-right">Units</th>
                      <th className="pb-3 text-right">Value</th>
                      <th className="pb-3">Next Expiry</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockMedicines.map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                      >
                        <td className="px-6 py-4 pr-4">
                          <p className="text-sm font-semibold text-on-surface">{item.name}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[item.genericName, item.form, item.strength]
                              .filter(Boolean)
                              .join(" • ") || "Catalog medicine"}
                          </p>
                        </td>
                        <td className="py-4 pr-4 text-sm text-on-surface-variant">
                          {item.currentBatchNumber ?? "No active batch"}
                        </td>
                        <td className="py-4 pr-4 text-right text-sm font-semibold text-on-surface">
                          {item.totalQuantityOnHand.toLocaleString("en-US")}
                        </td>
                        <td className="py-4 pr-4 text-right text-sm text-on-surface">
                          ETB {formatCurrency(item.totalStockValue)}
                        </td>
                        <td className="py-4 pr-4 text-sm text-on-surface-variant">
                          {item.nextExpiryDate ? formatDate(item.nextExpiryDate) : "No stock"}
                        </td>
                        <td className="py-4 pr-6">
                          <StatusBadge
                            label={item.status === "CRITICAL" ? "Critical" : "Warning"}
                            tone={item.status === "CRITICAL" ? "danger" : "warning"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No low-stock medicines"
                  description="Inventory levels are currently above the branch alert threshold."
                />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title="Expiry Queue"
              description="Batches that should be sold through, quarantined, or adjusted soon."
              actionHref="/medicines/adjustments"
              actionLabel="Open Adjustments"
            />

            {expiryBatches.length ? (
              <div className="space-y-3 p-6">
                {expiryBatches.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {item.medicineName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Batch {item.batchNumber} • {item.quantityOnHand} units
                          {item.supplierName ? ` • ${item.supplierName}` : ""}
                        </p>
                      </div>
                      <StatusBadge
                        label={formatExpiryLabel(item.status, item.daysUntilExpiry)}
                        tone={
                          item.status === "WARNING"
                            ? "warning"
                            : "danger"
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-3 text-xs md:grid-cols-3">
                      <InfoPair label="Expiry Date" value={formatDate(item.expiryDate)} />
                      <InfoPair label="Received" value={formatDate(item.receivedAt)} />
                      <InfoPair
                        label="Stock Value"
                        value={`ETB ${formatCurrency(item.quantityOnHand * item.sellingPrice)}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No expiry alerts"
                  description="There are no active batches inside the branch expiry threshold."
                />
              </div>
            )}
          </SurfaceCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title="Loss And Count Signals"
              description="Stock discrepancies and suspected shrinkage recorded in the last two weeks."
              actionHref="/medicines/counts"
              actionLabel="Run Stock Count"
            />

            {inventorySignals.length ? (
              <div className="space-y-3 p-6">
                {inventorySignals.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{item.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {item.medicineName} • Batch {item.batchNumber}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.severity === "CRITICAL" ? "Critical" : "Warning"}
                        tone={item.severity === "CRITICAL" ? "danger" : "warning"}
                      />
                    </div>

                    <p className="mt-3 text-sm text-on-surface-variant">{item.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                      <span>{item.actor}</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No loss signals"
                  description="The branch has no recent suspicious stock or cycle-count shortage alerts."
                />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title="Recent Sale Reversals"
              description="Voided transactions that may need supervisor follow-up."
              actionHref="/sales"
              actionLabel="Open Sales"
            />

            {salesSignals.length ? (
              <div className="space-y-3 p-6">
                {salesSignals.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{item.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {item.saleNumber} • {item.actor}
                        </p>
                      </div>
                      <StatusBadge label="Warning" tone="warning" />
                    </div>

                    <p className="mt-3 text-sm text-on-surface-variant">{item.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                      <span>
                        {item.totalAmount === null
                          ? "Amount unavailable"
                          : `ETB ${formatCurrency(item.totalAmount)}`}
                      </span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No sale reversals"
                  description="Voided sales will appear here for supervisor review."
                />
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-6 py-5"
      style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
    >
      <div>
        <h2 className="text-[1rem] font-bold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>

      <Link
        href={actionHref}
        className="ml-auto inline-flex h-10 items-center rounded-lg border border-outline/15 bg-surface-low px-4 text-sm font-bold text-on-surface transition-colors hover:bg-surface"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatExpiryLabel(
  status: "EXPIRED" | "CRITICAL" | "WARNING",
  daysUntilExpiry: number
) {
  if (status === "EXPIRED") {
    return "Expired";
  }

  if (daysUntilExpiry === 0) {
    return "Expires today";
  }

  return `${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} left`;
}
