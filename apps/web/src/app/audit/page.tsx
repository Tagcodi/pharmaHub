"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
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

export default function AuditPage() {
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
    return <AppLoading message="Loading audit feed…" />;
  }

  if (!session) {
    return null;
  }

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1100px] px-8 py-8">
        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <SurfaceCard className="p-7">
          <div className="mb-6">
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              Audit Log
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              Live operational events pulled from the current audit-backed activity feed.
            </p>
          </div>

          {overview?.recentActivity.length ? (
            <div className="space-y-4">
              {overview.recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg bg-surface-low p-4"
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      item.tone === "danger"
                        ? "bg-error-container text-on-error-container"
                        : item.tone === "success"
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface text-on-surface-variant"
                    }`}
                  >
                    <span className="text-[0.7rem] font-bold uppercase">
                      {item.title.slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-semibold text-on-surface">
                        {item.title}
                      </p>
                      <span className="text-[0.65rem] uppercase tracking-wide text-outline">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              compact
              title="No audit activity yet"
              description="As staff sign in, receive stock, and sell medicines, the live feed will appear here."
            />
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
