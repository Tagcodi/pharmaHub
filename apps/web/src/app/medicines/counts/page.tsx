"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { AppLoading } from "../../components/ui/AppLoading";
import { EmptyStateCard } from "../../components/ui/EmptyStateCard";
import { KpiCard } from "../../components/ui/KpiCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { SurfaceCard } from "../../components/ui/SurfaceCard";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type CreateCycleCountResponse,
  type CycleCountCatalogResponse,
  type CycleCountsResponse,
  type SessionResponse,
} from "../../lib/api";

export default function CycleCountsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<CycleCountCatalogResponse | null>(null);
  const [history, setHistory] = useState<CycleCountsResponse | null>(null);
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [search, setSearch] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setRequestedMedicineId(params.get("medicineId"));
  }, []);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!catalog?.batches.length) {
      setSelectedBatchId("");
      return;
    }

    const preferredBatch = requestedMedicineId
      ? catalog.batches.find((batch) => batch.medicineId === requestedMedicineId)
      : null;

    if (!selectedBatchId) {
      setSelectedBatchId(preferredBatch?.stockBatchId ?? catalog.batches[0]?.stockBatchId ?? "");
      return;
    }

    const stillExists = catalog.batches.some((batch) => batch.stockBatchId === selectedBatchId);

    if (!stillExists) {
      setSelectedBatchId(preferredBatch?.stockBatchId ?? catalog.batches[0]?.stockBatchId ?? "");
    }
  }, [catalog, requestedMedicineId, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatch) {
      return;
    }

    setCountedQuantity(String(selectedBatch.systemQuantity));
  }, [selectedBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

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

      const [catalogData, historyData] = await Promise.all([
        fetchJson<CycleCountCatalogResponse>("/inventory/count-catalog", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<CycleCountsResponse>("/inventory/cycle-counts", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setSession(sessionData);
      setCatalog(catalogData);
      setHistory(historyData);
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

  async function refreshData() {
    const token = getStoredToken();

    if (!token) {
      return;
    }

    const [catalogData, historyData] = await Promise.all([
      fetchJson<CycleCountCatalogResponse>("/inventory/count-catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<CycleCountsResponse>("/inventory/cycle-counts", {
        headers: getAuthHeaders(token),
      }),
    ]);

    setCatalog(catalogData);
    setHistory(historyData);
  }

  const filteredBatches = useMemo(() => {
    const batches = catalog?.batches ?? [];
    const query = search.trim().toLowerCase();

    return batches.filter((batch) => {
      if (!query) {
        return true;
      }

      return (
        batch.medicineName.toLowerCase().includes(query) ||
        (batch.genericName ?? "").toLowerCase().includes(query) ||
        batch.batchNumber.toLowerCase().includes(query)
      );
    });
  }, [catalog?.batches, search]);

  const selectedBatch =
    catalog?.batches.find((batch) => batch.stockBatchId === selectedBatchId) ?? null;
  const parsedCountedQuantity = Number(countedQuantity);
  const variance = selectedBatch
    ? (Number.isFinite(parsedCountedQuantity) ? parsedCountedQuantity : selectedBatch.systemQuantity) -
      selectedBatch.systemQuantity
    : 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!selectedBatch) {
      setError("Select a batch before saving a stock count.");
      return;
    }

    if (!Number.isInteger(parsedCountedQuantity) || parsedCountedQuantity < 0) {
      setError("Counted quantity must be a whole number greater than or equal to zero.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<CreateCycleCountResponse>("/inventory/cycle-counts", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          stockBatchId: selectedBatch.stockBatchId,
          countedQuantity: parsedCountedQuantity,
          notes: notes.trim() || undefined,
        }),
      });

      setSuccessMessage(
        `${result.medicine.name} batch ${result.batchNumber} counted at ${result.countedQuantity} units (${formatSignedNumber(
          result.quantityDelta
        )}).`
      );
      setNotes("");
      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <AppLoading message="Loading stock counts…" />;
  }

  if (!session) {
    return null;
  }

  const metrics = catalog?.metrics ?? {
    totalBatches: 0,
    totalUnitsOnHand: 0,
    expiringSoonBatchCount: 0,
    lowStockMedicineCount: 0,
  };

  const historyMetrics = history?.metrics ?? {
    countEvents: 0,
    matchedCount: 0,
    varianceCount: 0,
    shortageEvents: 0,
    overageEvents: 0,
    netVarianceUnits: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label="Countable Batches"
            value={String(metrics.totalBatches)}
            note={`${metrics.totalUnitsOnHand.toLocaleString("en-US")} units in scope`}
          />
          <KpiCard
            label="Expiring Soon"
            value={String(metrics.expiringSoonBatchCount)}
            valueColor="#6e3900"
            note="Batches needing priority review"
          />
          <KpiCard
            label="Low Stock Medicines"
            value={String(metrics.lowStockMedicineCount)}
            valueColor="#93000a"
            note="Useful for cycle count focus"
          />
          <KpiCard
            label="Count Events"
            value={String(historyMetrics.countEvents)}
            note={`${historyMetrics.matchedCount} exact matches`}
          />
          <KpiCard
            label="Net Variance"
            value={formatSignedNumber(historyMetrics.netVarianceUnits)}
            valueColor={historyMetrics.netVarianceUnits < 0 ? "#93000a" : "#004253"}
            note={`${historyMetrics.shortageEvents} shortages / ${historyMetrics.overageEvents} overages`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-6 rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
            {successMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_400px]">
          <SurfaceCard className="overflow-hidden">
            <div
              className="flex flex-wrap items-center gap-3 px-6 py-4"
              style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
            >
              <div>
                <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
                  Physical Stock Count
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Compare shelf count to system count batch by batch and record the result.
                </p>
              </div>

              <div className="relative ml-auto min-w-[260px] flex-1 max-w-[380px]">
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
                  placeholder="Search medicine or batch…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {filteredBatches.length ? (
              <div className="space-y-4 p-6">
                {filteredBatches.map((batch) => {
                  const isSelected = batch.stockBatchId === selectedBatchId;

                  return (
                    <button
                      key={batch.stockBatchId}
                      type="button"
                      onClick={() => setSelectedBatchId(batch.stockBatchId)}
                      className={[
                        "w-full rounded-2xl border p-4 text-left transition-colors",
                        isSelected
                          ? "border-primary/20 bg-primary/[0.04]"
                          : "border-outline/10 bg-surface-lowest hover:bg-surface-low",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {batch.medicineName}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[batch.genericName, batch.form, batch.strength]
                              .filter(Boolean)
                              .join(" • ") || "Catalog medicine"}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {batch.isExpiringSoon ? (
                            <StatusBadge label="Near expiry" tone="warning" />
                          ) : null}
                          <StatusBadge
                            label={batch.isLowStock ? "Low stock" : "In stock"}
                            tone={batch.isLowStock ? "danger" : "success"}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-xs md:grid-cols-4">
                        <Metric label="Batch" value={batch.batchNumber} />
                        <Metric
                          label="System Qty"
                          value={String(batch.systemQuantity)}
                        />
                        <Metric
                          label="Medicine Total"
                          value={String(batch.totalMedicineQuantity)}
                        />
                        <Metric
                          label="Expiry"
                          value={formatDate(batch.expiryDate)}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No active batches to count"
                  description="Receive stock first so the count workflow has live batches to compare."
                />
              </div>
            )}
          </SurfaceCard>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Count Entry</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Record the quantity physically found on the shelf for the selected batch.
                </p>
              </div>

              {selectedBatch ? (
                <>
                  <div className="rounded-2xl bg-surface-low p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {selectedBatch.medicineName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Batch {selectedBatch.batchNumber} • {formatDate(selectedBatch.expiryDate)}
                        </p>
                      </div>

                      <StatusBadge
                        label={selectedBatch.isExpiringSoon ? "Priority count" : "Ready"}
                        tone={selectedBatch.isExpiringSoon ? "warning" : "success"}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <InfoPair label="System quantity" value={String(selectedBatch.systemQuantity)} />
                      <InfoPair
                        label="Variance preview"
                        value={formatSignedNumber(variance)}
                      />
                    </div>
                  </div>

                  <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-on-surface">
                        Counted quantity
                      </span>
                      <input
                        value={countedQuantity}
                        onChange={(event) => setCountedQuantity(event.target.value)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="0"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-on-surface">
                        Notes
                      </span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Optional count notes or shelf location details."
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    >
                      {isSubmitting ? "Saving count…" : "Save Count"}
                    </button>
                  </form>
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title="Select a batch first"
                  description="Choose a batch from the left so we can compare physical stock to the system quantity."
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Recent Counts</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Latest physical count records captured for this branch.
                </p>
              </div>

              {history?.counts.length ? (
                <div className="space-y-3">
                  {history.counts.slice(0, 6).map((item) => (
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
                          label={
                            item.varianceType === "MATCH"
                              ? "Match"
                              : item.varianceType === "SHORTAGE"
                                ? "Shortage"
                                : "Overage"
                          }
                          tone={
                            item.varianceType === "MATCH"
                              ? "success"
                              : item.varianceType === "SHORTAGE"
                                ? "danger"
                                : "info"
                          }
                        />
                      </div>

                      <p className="mt-3 text-xs text-on-surface-variant">
                        System {item.previousQuantity} → Counted {item.countedQuantity} (
                        {formatSignedNumber(item.quantityDelta)})
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title="No cycle counts yet"
                  description="Saved counts will appear here so supervisors can review the latest variance decisions."
                />
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}
