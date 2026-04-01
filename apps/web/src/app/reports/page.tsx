"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type DashboardOverviewResponse,
  type SalesOverviewResponse,
  type SessionResponse,
} from "../lib/api";

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardOverviewResponse | null>(null);
  const [sales, setSales] = useState<SalesOverviewResponse | null>(null);
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
      const [sessionData, dashboardData, salesData] = await Promise.all([
        fetchJson<SessionResponse>("/auth/me", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<DashboardOverviewResponse>("/dashboard/overview", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<SalesOverviewResponse>("/sales/overview", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setSession(sessionData);
      setDashboard(dashboardData);
      setSales(salesData);
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

  if (isLoading) {
    return <AppLoading message="Loading reports…" />;
  }

  if (!session) {
    return null;
  }

  const inventoryMetrics = dashboard?.metrics ?? {
    totalInventoryValue: 0,
    registeredMedicines: 0,
    activeBatches: 0,
    lowStockCount: 0,
    nearExpiryBatchCount: 0,
    criticalAlertCount: 0,
    totalUnitsOnHand: 0,
  };

  const salesMetrics = sales?.metrics ?? {
    todaySalesAmount: 0,
    todaySalesCount: 0,
    averageTicket: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label="Inventory Value"
            value={`ETB ${formatCurrency(inventoryMetrics.totalInventoryValue)}`}
            note={`${inventoryMetrics.totalUnitsOnHand.toLocaleString("en-US")} total units on hand`}
          />
          <KpiCard
            label="Today Sales"
            value={`ETB ${formatCurrency(salesMetrics.todaySalesAmount)}`}
            note={`${salesMetrics.todaySalesCount} completed tickets today`}
          />
          <KpiCard
            label="Average Ticket"
            value={`ETB ${formatCurrency(salesMetrics.averageTicket)}`}
            note="Completed POS transactions"
          />
          <KpiCard
            label="Critical Alerts"
            value={String(inventoryMetrics.criticalAlertCount)}
            valueColor="#93000a"
            note="Current low-stock and expiry pressure"
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <SurfaceCard className="p-7">
            <div className="mb-5">
              <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
                Reports
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Snapshot metrics for operations, inventory pressure, and sales velocity.
              </p>
            </div>

            {sales?.recentSales.length ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                    <th className="pb-3">Sale No.</th>
                    <th className="pb-3">Sold By</th>
                    <th className="pb-3">Items</th>
                    <th className="pb-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.recentSales.map((sale) => (
                    <tr
                      key={sale.id}
                      style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                    >
                      <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                        {sale.saleNumber}
                      </td>
                      <td className="py-3 pr-3 text-sm text-on-surface-variant">
                        {sale.soldBy}
                      </td>
                      <td className="py-3 pr-3 text-sm text-on-surface-variant">
                        {sale.itemCount}
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
                title="No reportable sales yet"
                description="Completed transactions will start populating this report as the POS is used."
              />
            )}
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <h2 className="text-[1rem] font-bold text-on-surface">Branch Summary</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Live counts based on the current inventory and sales state
            </p>

            <div className="mt-5 space-y-4">
              <SummaryRow
                label="Registered medicines"
                value={String(inventoryMetrics.registeredMedicines)}
              />
              <SummaryRow
                label="Active batches"
                value={String(inventoryMetrics.activeBatches)}
              />
              <SummaryRow
                label="Low stock"
                value={String(inventoryMetrics.lowStockCount)}
              />
              <SummaryRow
                label="Near expiry"
                value={String(inventoryMetrics.nearExpiryBatchCount)}
              />
            </div>
          </SurfaceCard>
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

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
