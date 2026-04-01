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
  type AdjustmentCatalogResponse,
  type AdjustmentReason,
  type CreateAdjustmentResponse,
  type InventoryAdjustmentsResponse,
  type SessionResponse,
} from "../../lib/api";

const REASON_OPTIONS: Array<{
  value: AdjustmentReason;
  label: string;
  hint: string;
}> = [
  { value: "COUNT_CORRECTION", label: "Count correction", hint: "Use when physical count differs from the system." },
  { value: "THEFT_SUSPECTED", label: "Theft suspected", hint: "Record unexplained loss that needs review." },
  { value: "LOST", label: "Lost stock", hint: "Record missing stock that cannot be accounted for." },
  { value: "DAMAGE", label: "Damaged", hint: "Remove unusable stock from the sellable pool." },
  { value: "EXPIRED", label: "Expired", hint: "Retire batches that can no longer be dispensed." },
  { value: "RETURN_TO_SUPPLIER", label: "Return to supplier", hint: "Track stock sent back upstream." },
  { value: "OTHER", label: "Other", hint: "Use only if none of the standard reasons fit." },
] as const;

export default function StockAdjustmentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<AdjustmentCatalogResponse | null>(null);
  const [adjustments, setAdjustments] = useState<InventoryAdjustmentsResponse | null>(
    null
  );
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [search, setSearch] = useState("");
  const [quantityDelta, setQuantityDelta] = useState("-1");
  const [reason, setReason] = useState<AdjustmentReason>("COUNT_CORRECTION");
  const [notes, setNotes] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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
    if (!catalog?.medicines.length) {
      setSelectedMedicineId("");
      setSelectedBatchId("");
      return;
    }

    const defaultMedicineId =
      requestedMedicineId &&
      catalog.medicines.some((medicine) => medicine.id === requestedMedicineId)
        ? requestedMedicineId
        : selectedMedicineId || catalog.medicines[0]?.id || "";

    if (defaultMedicineId !== selectedMedicineId) {
      setSelectedMedicineId(defaultMedicineId);
      return;
    }

    const selectedMedicine = catalog.medicines.find(
      (medicine) => medicine.id === selectedMedicineId
    );
    const selectedBatchExists = selectedMedicine?.batches.some(
      (batch) => batch.id === selectedBatchId
    );

    if (!selectedBatchExists) {
      setSelectedBatchId(selectedMedicine?.batches[0]?.id ?? "");
    }
  }, [catalog, requestedMedicineId, selectedBatchId, selectedMedicineId]);

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

      setSession(sessionData);

      const [catalogData, adjustmentData] = await Promise.all([
        fetchJson<AdjustmentCatalogResponse>("/inventory/adjustment-catalog", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<InventoryAdjustmentsResponse>("/inventory/adjustments", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setCatalog(catalogData);
      setAdjustments(adjustmentData);
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

    const [catalogData, adjustmentData] = await Promise.all([
      fetchJson<AdjustmentCatalogResponse>("/inventory/adjustment-catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<InventoryAdjustmentsResponse>("/inventory/adjustments", {
        headers: getAuthHeaders(token),
      }),
    ]);

    setCatalog(catalogData);
    setAdjustments(adjustmentData);
  }

  const filteredMedicines = useMemo(() => {
    const medicines = catalog?.medicines ?? [];
    const query = search.trim().toLowerCase();

    return medicines.filter((medicine) => {
      if (!query) {
        return true;
      }

      return (
        medicine.name.toLowerCase().includes(query) ||
        (medicine.genericName ?? "").toLowerCase().includes(query) ||
        medicine.batches.some((batch) =>
          batch.batchNumber.toLowerCase().includes(query)
        )
      );
    });
  }, [catalog?.medicines, search]);

  const selectedMedicine =
    catalog?.medicines.find((medicine) => medicine.id === selectedMedicineId) ?? null;
  const selectedBatch =
    selectedMedicine?.batches.find((batch) => batch.id === selectedBatchId) ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const parsedQuantity = Number(quantityDelta);

    if (!selectedBatchId) {
      setError("Select a batch before recording an adjustment.");
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity === 0) {
      setError("Enter a whole number adjustment, such as -2 or 3.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await fetchJson<CreateAdjustmentResponse>("/inventory/adjustments", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          stockBatchId: selectedBatchId,
          quantityDelta: parsedQuantity,
          reason,
          notes: notes.trim() || undefined,
        }),
      });

      setSuccessMsg(
        `${result.medicine.name} batch ${result.batch.batchNumber} adjusted by ${formatSignedNumber(
          result.quantityDelta
        )} units.`
      );
      setNotes("");
      setQuantityDelta("-1");

      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <AppLoading message="Loading stock adjustments…" />;
  }

  if (!session) {
    return null;
  }

  const metrics = adjustments?.metrics ?? {
    totalAdjustments: 0,
    positiveAdjustments: 0,
    negativeAdjustments: 0,
    suspectedLossCount: 0,
    netUnitsDelta: 0,
  };

  const selectedReason = REASON_OPTIONS.find((option) => option.value === reason);

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label="Adjustment Events"
            value={String(metrics.totalAdjustments)}
            note="Recent adjustment records"
          />
          <KpiCard
            label="Negative Moves"
            value={String(metrics.negativeAdjustments)}
            valueColor="#93000a"
            note="Losses, expiry, damage, and returns"
          />
          <KpiCard
            label="Suspected Loss"
            value={String(metrics.suspectedLossCount)}
            valueColor="#93000a"
            note="Lost or theft-suspected incidents"
          />
          <KpiCard
            label="Net Units Delta"
            value={formatSignedNumber(metrics.netUnitsDelta)}
            valueColor={metrics.netUnitsDelta < 0 ? "#93000a" : "#004253"}
            note={`${metrics.positiveAdjustments} positive corrections`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        {successMsg ? (
          <div className="mb-6 rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
            {successMsg}
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
                  Stock Adjustments
                </h1>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Record losses, corrections, expiry write-offs, and supplier returns with a reason.
                </p>
              </div>

              <div className="relative ml-auto min-w-[260px] flex-1">
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
                  placeholder="Search medicines or batch numbers…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {!filteredMedicines.length ? (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title="No stocked medicines available"
                  description="Receive stock first so there are active batches available to adjust."
                />
              </div>
            ) : (
              <div className="space-y-4 p-6">
                {filteredMedicines.map((medicine) => {
                  const isSelected = medicine.id === selectedMedicineId;

                  return (
                    <div
                      key={medicine.id}
                      className={[
                        "rounded-2xl border p-4 transition-colors",
                        isSelected
                          ? "border-primary/20 bg-primary/[0.04]"
                          : "border-outline/10 bg-surface-lowest",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMedicineId(medicine.id);
                          setSelectedBatchId(medicine.batches[0]?.id ?? "");
                        }}
                        className="flex w-full items-start justify-between gap-4 text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {medicine.name}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[medicine.genericName, medicine.form, medicine.strength]
                              .filter(Boolean)
                              .join(" • ") || "Catalog medicine"}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {medicine.isLowStock ? (
                            <StatusBadge label="Low stock" tone="danger" />
                          ) : (
                            <StatusBadge label="Stable" tone="success" />
                          )}
                        </div>
                      </button>

                      <div className="mt-4 grid gap-3">
                        {medicine.batches.map((batch) => {
                          const batchSelected = batch.id === selectedBatchId;

                          return (
                            <button
                              key={batch.id}
                              type="button"
                              onClick={() => {
                                setSelectedMedicineId(medicine.id);
                                setSelectedBatchId(batch.id);
                              }}
                              className={[
                                "flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors",
                                batchSelected
                                  ? "border-primary/20 bg-surface"
                                  : "border-outline/10 bg-surface-low hover:bg-surface",
                              ].join(" ")}
                            >
                              <div>
                                <p className="text-sm font-semibold text-on-surface">
                                  Batch {batch.batchNumber}
                                </p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  Expires {formatDate(batch.expiryDate)}
                                  {batch.supplierName ? ` • ${batch.supplierName}` : ""}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-sm font-semibold text-on-surface">
                                  {batch.quantityOnHand.toLocaleString("en-US")} units
                                </p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  ETB {formatCurrency(batch.sellingPrice)} sell
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SurfaceCard>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Adjustment Form</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Every change writes an adjustment record, stock movement, and audit event.
                </p>
              </div>

              {selectedMedicine && selectedBatch ? (
                <>
                  <div className="rounded-2xl bg-surface-low p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {selectedMedicine.name}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Batch {selectedBatch.batchNumber} • Expires{" "}
                          {formatDate(selectedBatch.expiryDate)}
                        </p>
                      </div>

                      {selectedBatch.isExpiringSoon ? (
                        <StatusBadge label="Near expiry" tone="warning" />
                      ) : (
                        <StatusBadge label="Available" tone="success" />
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <InfoPair
                        label="Current quantity"
                        value={`${selectedBatch.quantityOnHand.toLocaleString("en-US")} units`}
                      />
                      <InfoPair
                        label="Selling price"
                        value={`ETB ${formatCurrency(selectedBatch.sellingPrice)}`}
                      />
                    </div>
                  </div>

                  <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <Field label="Quantity delta">
                      <input
                        value={quantityDelta}
                        onChange={(event) => setQuantityDelta(event.target.value)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="-2"
                      />
                    </Field>

                    <Field label="Reason">
                      <select
                        value={reason}
                        onChange={(event) =>
                          setReason(event.target.value as AdjustmentReason)
                        }
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {REASON_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                        {selectedReason?.hint}
                      </p>
                    </Field>

                    <Field label="Notes">
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Add a short explanation for the adjustment."
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    >
                      {isSubmitting ? "Saving adjustment…" : "Record Adjustment"}
                    </button>
                  </form>
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title="Select a batch first"
                  description="Pick a medicine and batch from the left so the adjustment can be tied to real stock."
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Recent Adjustments</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  The last recorded stock corrections for this branch.
                </p>
              </div>

              {adjustments?.adjustments.length ? (
                <div className="space-y-3">
                  {adjustments.adjustments.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {item.medicine.name}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            Batch {item.batch.batchNumber} • {formatReason(item.reason)}
                          </p>
                        </div>

                        <StatusBadge
                          label={formatSignedNumber(item.quantityDelta)}
                          tone={item.quantityDelta < 0 ? "danger" : "success"}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                        <span>{item.createdBy}</span>
                        <span>{formatRelativeTime(item.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title="No adjustments yet"
                  description="As soon as staff correct stock or record losses, the latest adjustments will appear here."
                />
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-on-surface">{label}</span>
      {children}
    </label>
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

function formatReason(value: AdjustmentReason) {
  return value.replaceAll("_", " ").toLowerCase();
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
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
