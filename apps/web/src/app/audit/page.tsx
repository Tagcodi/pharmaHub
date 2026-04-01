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
  getAuthHeaders,
  getStoredToken,
  type AuditLogsResponse,
  type SessionResponse,
} from "../lib/api";

const FILTERS = ["All", "Inventory", "Sales", "Access", "Users", "Catalog"] as const;

export default function AuditPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [logs, setLogs] = useState<AuditLogsResponse | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
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

      const logsData = await fetchJson<AuditLogsResponse>("/audit/logs", {
        headers: getAuthHeaders(token),
      });

      setSession(sessionData);
      setLogs(logsData);
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

  const filteredItems = useMemo(() => {
    const items = logs?.items ?? [];

    if (filter === "All") {
      return items;
    }

    return items.filter((item) => item.category === filter);
  }, [filter, logs?.items]);

  if (isLoading) {
    return <AppLoading message="Loading audit feed…" />;
  }

  if (!session) {
    return null;
  }

  const metrics = logs?.metrics ?? {
    totalEvents: 0,
    stockAdjustments: 0,
    suspectedLossEvents: 0,
    failedLoginCount: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label="Audit Events"
            value={String(metrics.totalEvents)}
            note="Latest branch and system events"
          />
          <KpiCard
            label="Stock Adjustments"
            value={String(metrics.stockAdjustments)}
            note="Manual inventory corrections"
          />
          <KpiCard
            label="Suspected Loss"
            value={String(metrics.suspectedLossEvents)}
            valueColor="#93000a"
            note="Loss or theft-suspected incidents"
          />
          <KpiCard
            label="Failed Logins"
            value={String(metrics.failedLoginCount)}
            valueColor="#93000a"
            note="Rejected sign-in attempts"
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <SurfaceCard className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
                Audit Log
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Review access, inventory, sales, and staff events with branch-level accountability.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    filter === item
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-low text-on-surface-variant hover:bg-surface",
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length ? (
            <div className="mt-6 space-y-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-outline/10 bg-surface-low p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">
                          {item.title}
                        </p>
                        <StatusBadge
                          label={item.category}
                          tone={
                            item.tone === "danger"
                              ? "danger"
                              : item.tone === "warning"
                                ? "warning"
                                : item.tone === "success"
                                  ? "success"
                                  : "neutral"
                          }
                        />
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                        {item.description}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                      <p className="mt-2 text-xs text-on-surface-variant">
                        {item.actor}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyStateCard
                compact
                title="No audit activity yet"
                description="As staff sign in, sell stock, and record adjustments, the audit trail will appear here."
              />
            </div>
          )}
        </SurfaceCard>
      </div>
    </AppShell>
  );
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
