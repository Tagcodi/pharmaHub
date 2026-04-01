"use client";

import { useEffect, useState } from "react";
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
  type DashboardOverviewResponse,
  type SessionResponse,
} from "../lib/api";

export default function AlertsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
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
      const [sessionData, overviewData] = await Promise.all([
        fetchJson<SessionResponse>("/auth/me", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<DashboardOverviewResponse>("/dashboard/overview", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setSession(sessionData);
      setOverview(overviewData);
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
    return <AppLoading message="Loading alerts…" />;
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

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-3">
          <KpiCard
            label="Critical Alerts"
            value={String(metrics.criticalAlertCount)}
            valueColor="#93000a"
            note="Combined low-stock and expiry pressure"
          />
          <KpiCard
            label="Low Stock"
            value={String(metrics.lowStockCount)}
            valueColor="#93000a"
            note="Medicines close to depletion"
          />
          <KpiCard
            label="Near Expiry"
            value={String(metrics.nearExpiryBatchCount)}
            valueColor="#6e3900"
            note="Batches expiring within 30 days"
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <SurfaceCard className="p-7">
          <div className="mb-5">
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              Alerts
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              Live branch risk signals powered by the current inventory state.
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
                  <th className="pb-3">Alert</th>
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
                    <td className="py-3 pr-3 text-sm text-on-surface-variant">
                      {item.batchNumber}
                    </td>
                    <td className="py-3 pr-3 text-right text-sm text-on-surface">
                      {item.stock.toLocaleString("en-US")}
                    </td>
                    <td className="py-3 pr-3 text-sm text-on-surface-variant">
                      {formatDate(item.expiryDate)}
                    </td>
                    <td className="py-3">
                      <StatusBadge
                        label={
                          item.status === "CRITICAL"
                            ? "Critical"
                            : item.status === "WARNING"
                              ? "Warning"
                              : "Monitor"
                        }
                        tone={
                          item.status === "CRITICAL"
                            ? "danger"
                            : item.status === "WARNING"
                              ? "warning"
                              : "success"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyStateCard
              compact
              title="No active alerts"
              description="As stock gets low or expiry dates approach, alerts will appear here."
            />
          )}
        </SurfaceCard>
      </div>
    </AppShell>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
