"use client";

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
  getApiBase,
  getAuthHeaders,
  getStoredToken,
  type ReportsSummaryResponse,
  type SessionResponse,
} from "../lib/api";

const RANGE_OPTIONS = [7, 30, 90] as const;

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [report, setReport] = useState<ReportsSummaryResponse | null>(null);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage(30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage(nextRange: (typeof RANGE_OPTIONS)[number], refresh = false) {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const sessionData =
        session ??
        (await fetchJson<SessionResponse>("/auth/me", {
          headers: getAuthHeaders(token),
        }));

      if (sessionData.user.role === "CASHIER") {
        router.replace("/dashboard");
        return;
      }

      const reportData = await fetchJson<ReportsSummaryResponse>(
        `/reports/summary?rangeDays=${nextRange}`,
        {
          headers: getAuthHeaders(token),
        }
      );

      setSession(sessionData);
      setReport(reportData);
      setRangeDays(nextRange);
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
      setIsRefreshing(false);
    }
  }

  async function exportReport() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsExporting(true);

    try {
      const response = await fetch(
        `${getApiBase()}/reports/export.csv?rangeDays=${rangeDays}`,
        {
          headers: getAuthHeaders(token),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to export the report.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pharmahub-report-${rangeDays}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsExporting(false);
    }
  }

  const tallestDailySales = useMemo(() => {
    const values = report?.sales.dailySales.map((item) => item.value) ?? [];
    return Math.max(...values, 0);
  }, [report?.sales.dailySales]);

  if (isLoading) {
    return <AppLoading message="Loading reports…" />;
  }

  if (!session || !report) {
    return null;
  }

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-outline">
              Owner Reports
            </p>
            <h1 className="mt-2 text-[2.4rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              Performance and control.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              View live branch performance, track stock loss pressure, and export the current
              report window for review or handoff.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full bg-surface-low p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void loadPage(option, true)}
                  disabled={isRefreshing && rangeDays === option}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors",
                    rangeDays === option
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:text-on-surface",
                  ].join(" ")}
                >
                  {option}d
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={exportReport}
              disabled={isExporting}
              className="flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 2v7m0 0l3-3m-3 3L4 6m-2 5h10"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isExporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label="Sales"
            value={`ETB ${formatCurrency(report.sales.totalSalesAmount)}`}
            note={`${report.sales.completedSalesCount} completed tickets`}
          />
          <KpiCard
            label="Units Sold"
            value={report.sales.totalUnitsSold.toLocaleString("en-US")}
            note={`Average ticket ETB ${formatCurrency(report.sales.averageTicket)}`}
          />
          <KpiCard
            label="Inventory Value"
            value={`ETB ${formatCurrency(report.inventory.totalInventoryValue)}`}
            note={`${report.inventory.totalUnitsOnHand.toLocaleString("en-US")} units on hand`}
          />
          <KpiCard
            label="Low Stock"
            value={String(report.inventory.lowStockCount)}
            valueColor="#93000a"
            note={`${report.inventory.nearExpiryBatchCount} near-expiry batches`}
          />
          <KpiCard
            label="Suspected Loss"
            value={String(report.adjustments.suspectedLossCount)}
            valueColor="#93000a"
            note={`${report.adjustments.totalAdjustments} total adjustments`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-6">
            <SurfaceCard className="p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.1rem] font-bold text-on-surface">Sales Trend</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Daily completed sales across the selected window.
                  </p>
                </div>
                <span className="rounded-full bg-surface-low px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-outline">
                  {formatDate(report.range.startDate)} to {formatDate(report.range.endDate)}
                </span>
              </div>

              <div className="grid h-[220px] grid-cols-[repeat(auto-fit,minmax(26px,1fr))] items-end gap-3">
                {report.sales.dailySales.map((point) => (
                  <div key={point.dayKey} className="flex h-full flex-col items-center justify-end gap-3">
                    <div className="relative flex w-full flex-1 items-end rounded-full bg-surface-low px-1">
                      <div
                        className="w-full rounded-full"
                        style={{
                          minHeight: point.value > 0 ? "10px" : "4px",
                          height: `${
                            tallestDailySales > 0
                              ? Math.max((point.value / tallestDailySales) * 100, 4)
                              : 4
                          }%`,
                          background:
                            point.value > 0
                              ? "linear-gradient(180deg, #59d5ae 0%, #004253 100%)"
                              : "rgba(0,66,83,0.12)",
                        }}
                        title={`ETB ${formatCurrency(point.value)}`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                        {point.label}
                      </p>
                      <p className="mt-1 text-[0.68rem] text-on-surface-variant">
                        {point.value > 0 ? formatCompactCurrency(point.value) : "0"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">Top Medicines</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Highest-performing medicines by revenue in this window.
                </p>
              </div>

              {report.sales.topMedicines.length ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="pb-3">Medicine</th>
                      <th className="pb-3 text-right">Units Sold</th>
                      <th className="pb-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.topMedicines.map((item) => (
                      <tr key={item.medicineId} style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}>
                        <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                          {item.name}
                        </td>
                        <td className="py-3 pr-3 text-right text-sm text-on-surface-variant">
                          {item.quantitySold}
                        </td>
                        <td className="py-3 text-right text-sm font-semibold text-on-surface">
                          ETB {formatCurrency(item.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyStateCard
                  compact
                  title="No medicine performance yet"
                  description="Completed sales in the selected range will populate this ranking."
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">Recent Sales</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Latest completed sales included in the current report window.
                </p>
              </div>

              {report.sales.recentSales.length ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="pb-3">Sale No.</th>
                      <th className="pb-3">Sold By</th>
                      <th className="pb-3 text-right">Items</th>
                      <th className="pb-3">Payment</th>
                      <th className="pb-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.recentSales.map((sale) => (
                      <tr key={sale.id} style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}>
                        <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                          {sale.saleNumber}
                        </td>
                        <td className="py-3 pr-3 text-sm text-on-surface-variant">
                          {sale.soldBy}
                        </td>
                        <td className="py-3 pr-3 text-right text-sm text-on-surface-variant">
                          {sale.itemCount}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge label={formatPaymentMethod(sale.paymentMethod)} tone="neutral" />
                        </td>
                        <td className="py-3 text-right text-sm font-semibold text-on-surface">
                          ETB {formatCurrency(sale.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyStateCard
                  compact
                  title="No recent sales"
                  description="The recent sales table will appear once the branch records completed POS transactions."
                />
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">Payment Mix</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Sales distribution by payment method.
              </p>

              <div className="mt-5 space-y-4">
                {report.sales.paymentBreakdown.map((item) => (
                  <SummaryRow
                    key={item.method}
                    label={formatPaymentMethod(item.method)}
                    value={`${item.count} sales • ETB ${formatCurrency(item.amount)}`}
                  />
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">Inventory Pressure</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Medicines that need owner attention soonest.
              </p>

              {report.inventory.lowStockMedicines.length ? (
                <div className="mt-5 space-y-4">
                  {report.inventory.lowStockMedicines.map((medicine) => (
                    <div
                      key={medicine.medicineId}
                      className="rounded-xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{medicine.name}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {medicine.quantityOnHand} units on hand
                          </p>
                        </div>
                        <StatusBadge
                          label={medicine.isExpiringSoon ? "Low + expiry" : "Low stock"}
                          tone={medicine.isExpiringSoon ? "warning" : "danger"}
                        />
                      </div>
                      <p className="mt-3 text-xs text-on-surface-variant">
                        Next expiry: {medicine.nextExpiryDate ? formatDate(medicine.nextExpiryDate) : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyStateCard
                    compact
                    title="No low-stock medicines"
                    description="Low-stock pressure will appear here when the branch inventory dips under threshold."
                  />
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">Adjustment Reasons</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Why stock changed outside normal stock-in and sale flows.
              </p>

              <div className="mt-5 space-y-4">
                {report.adjustments.reasonBreakdown.length ? (
                  report.adjustments.reasonBreakdown.map((item) => (
                    <SummaryRow
                      key={item.reason}
                      label={formatReason(item.reason)}
                      value={`${item.count} events`}
                    />
                  ))
                ) : (
                  <EmptyStateCard
                    compact
                    title="No adjustments recorded"
                    description="Manual stock adjustments in the selected range will appear here."
                  />
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">Recent Loss Events</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Most recent lost or theft-suspected events.
              </p>

              {report.adjustments.recentLossEvents.length ? (
                <div className="mt-5 space-y-4">
                  {report.adjustments.recentLossEvents.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {item.medicineName}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            Batch {item.batchNumber} • {item.createdBy}
                          </p>
                        </div>
                        <StatusBadge
                          label={`${item.quantityDelta}`}
                          tone="danger"
                        />
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
                        {formatReason(item.reason)}
                        {item.notes ? ` • ${item.notes}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyStateCard
                    compact
                    title="No recent loss events"
                    description="Lost or theft-suspected adjustments in the selected range will appear here."
                  />
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

function formatPaymentMethod(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function formatReason(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactCurrency(value: number) {
  if (value === 0) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
