"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { AppLoading } from "../../components/ui/AppLoading";
import { EmptyStateCard } from "../../components/ui/EmptyStateCard";
import { KpiCard } from "../../components/ui/KpiCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { SurfaceCard } from "../../components/ui/SurfaceCard";
import { useI18n } from "../../i18n/I18nProvider";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
} from "../../i18n/format";
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

export default function StockAdjustmentsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = ADJUSTMENTS_COPY[locale] as (typeof ADJUSTMENTS_COPY)["en"];
  const reasonOptions = getReasonOptions(text);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<AdjustmentCatalogResponse | null>(null);
  const [adjustments, setAdjustments] = useState<InventoryAdjustmentsResponse | null>(
    null
  );
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [requestedBatchId, setRequestedBatchId] = useState<string | null>(null);
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
    setRequestedBatchId(params.get("stockBatchId"));
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

    const requestedMedicineByBatch =
      requestedBatchId
        ? catalog.medicines.find((medicine) =>
            medicine.batches.some((batch) => batch.id === requestedBatchId)
          )?.id ?? null
        : null;
    const defaultMedicineId =
      requestedMedicineByBatch ??
      (requestedMedicineId &&
      catalog.medicines.some((medicine) => medicine.id === requestedMedicineId)
        ? requestedMedicineId
        : selectedMedicineId || catalog.medicines[0]?.id || "");

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
      const requestedBatchExists =
        requestedBatchId &&
        selectedMedicine?.batches.some((batch) => batch.id === requestedBatchId);
      setSelectedBatchId(
        requestedBatchExists ? requestedBatchId! : selectedMedicine?.batches[0]?.id ?? ""
      );
    }
  }, [
    catalog,
    requestedBatchId,
    requestedMedicineId,
    selectedBatchId,
    selectedMedicineId,
  ]);

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
      setError(text.selectBatchBeforeAdjustment);
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity === 0) {
      setError(text.enterWholeNumberAdjustment);
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
        text.adjustmentSavedMessage
          .replace("{medicine}", result.medicine.name)
          .replace("{batch}", result.batch.batchNumber)
          .replace("{delta}", formatSignedNumber(result.quantityDelta))
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
    return <AppLoading message={text.loadingStockAdjustments} />;
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

  const selectedReason = reasonOptions.find((option) => option.value === reason);

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label={text.adjustmentEvents}
            value={String(metrics.totalAdjustments)}
            note={text.recentAdjustmentRecords}
          />
          <KpiCard
            label={text.negativeMoves}
            value={String(metrics.negativeAdjustments)}
            valueColor="#93000a"
            note={text.lossesExpiryDamageReturns}
          />
          <KpiCard
            label={text.suspectedLoss}
            value={String(metrics.suspectedLossCount)}
            valueColor="#93000a"
            note={text.lostOrTheftSuspected}
          />
          <KpiCard
            label={text.netUnitsDelta}
            value={formatSignedNumber(metrics.netUnitsDelta)}
            valueColor={metrics.netUnitsDelta < 0 ? "#93000a" : "#004253"}
            note={`${metrics.positiveAdjustments} ${text.positiveCorrections}`}
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
                  {text.stockAdjustments}
                </h1>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {text.stockAdjustmentsDescription}
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
                  placeholder={text.searchPlaceholder}
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
                  title={text.noStockedMedicines}
                  description={text.noStockedMedicinesDescription}
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
                              .join(" • ") || text.catalogMedicine}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {medicine.isLowStock ? (
                            <StatusBadge label={text.lowStock} tone="danger" />
                          ) : (
                            <StatusBadge label={text.stable} tone="success" />
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
                                  {text.batch} {batch.batchNumber}
                                </p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  {text.expires} {formatDate(batch.expiryDate, locale)}
                                  {batch.supplierName ? ` • ${batch.supplierName}` : ""}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-sm font-semibold text-on-surface">
                                  {batch.quantityOnHand.toLocaleString()} {text.units}
                                </p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  ETB {formatCurrency(batch.sellingPrice, locale)} {text.sell}
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
                <h2 className="text-[1rem] font-bold text-on-surface">{text.adjustmentForm}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.adjustmentFormDescription}
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
                          {text.batch} {selectedBatch.batchNumber} • {text.expires}{" "}
                          {formatDate(selectedBatch.expiryDate, locale)}
                        </p>
                      </div>

                      {selectedBatch.isExpiringSoon ? (
                        <StatusBadge label={text.nearExpiry} tone="warning" />
                      ) : (
                        <StatusBadge label={text.available} tone="success" />
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <InfoPair
                        label={text.currentQuantity}
                        value={`${selectedBatch.quantityOnHand.toLocaleString()} ${text.units}`}
                      />
                      <InfoPair
                        label={text.sellingPrice}
                        value={`ETB ${formatCurrency(selectedBatch.sellingPrice, locale)}`}
                      />
                    </div>
                  </div>

                  <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <Field label={text.quantityDelta}>
                      <input
                        value={quantityDelta}
                        onChange={(event) => setQuantityDelta(event.target.value)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="-2"
                      />
                    </Field>

                    <Field label={text.reason}>
                      <select
                        value={reason}
                        onChange={(event) =>
                          setReason(event.target.value as AdjustmentReason)
                        }
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {reasonOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                        {selectedReason?.hint}
                      </p>
                    </Field>

                    <Field label={text.notes}>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.notesPlaceholder}
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    >
                      {isSubmitting ? text.savingAdjustment : text.recordAdjustment}
                    </button>
                  </form>
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.selectBatchFirst}
                  description={text.selectBatchFirstDescription}
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">{text.recentAdjustments}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.recentAdjustmentsDescription}
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
                            {text.batch} {item.batch.batchNumber} • {formatReason(item.reason, text)}
                          </p>
                        </div>

                        <StatusBadge
                          label={formatSignedNumber(item.quantityDelta)}
                          tone={item.quantityDelta < 0 ? "danger" : "success"}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                        <span>{item.createdBy}</span>
                        <span>{formatRelativeTime(item.createdAt, locale)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noAdjustmentsYet}
                  description={text.noAdjustmentsYetDescription}
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

function getReasonOptions(text: (typeof ADJUSTMENTS_COPY)["en"]) {
  return [
    {
      value: "COUNT_CORRECTION" as const,
      label: text.reasonCountCorrection,
      hint: text.reasonCountCorrectionHint,
    },
    {
      value: "THEFT_SUSPECTED" as const,
      label: text.reasonTheftSuspected,
      hint: text.reasonTheftSuspectedHint,
    },
    {
      value: "LOST" as const,
      label: text.reasonLost,
      hint: text.reasonLostHint,
    },
    {
      value: "DAMAGE" as const,
      label: text.reasonDamaged,
      hint: text.reasonDamagedHint,
    },
    {
      value: "EXPIRED" as const,
      label: text.reasonExpired,
      hint: text.reasonExpiredHint,
    },
    {
      value: "RETURN_TO_SUPPLIER" as const,
      label: text.reasonReturnToSupplier,
      hint: text.reasonReturnToSupplierHint,
    },
    {
      value: "OTHER" as const,
      label: text.reasonOther,
      hint: text.reasonOtherHint,
    },
  ];
}

function formatReason(
  value: AdjustmentReason,
  text: (typeof ADJUSTMENTS_COPY)["en"]
) {
  const option = getReasonOptions(text).find((item) => item.value === value);
  return option?.label ?? value.replaceAll("_", " ").toLowerCase();
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

const ADJUSTMENTS_COPY = {
  en: {
    loadingStockAdjustments: "Loading stock adjustments…",
    selectBatchBeforeAdjustment: "Select a batch before recording an adjustment.",
    enterWholeNumberAdjustment: "Enter a whole number adjustment, such as -2 or 3.",
    adjustmentSavedMessage: "{medicine} batch {batch} adjusted by {delta} units.",
    adjustmentEvents: "Adjustment Events",
    recentAdjustmentRecords: "Recent adjustment records",
    negativeMoves: "Negative Moves",
    lossesExpiryDamageReturns: "Losses, expiry, damage, and returns",
    suspectedLoss: "Suspected Loss",
    lostOrTheftSuspected: "Lost or theft-suspected incidents",
    netUnitsDelta: "Net Units Delta",
    positiveCorrections: "positive corrections",
    stockAdjustments: "Stock Adjustments",
    stockAdjustmentsDescription:
      "Record losses, corrections, expiry write-offs, and supplier returns with a reason.",
    searchPlaceholder: "Search medicines or batch numbers…",
    noStockedMedicines: "No stocked medicines available",
    noStockedMedicinesDescription:
      "Receive stock first so there are active batches available to adjust.",
    catalogMedicine: "Catalog medicine",
    lowStock: "Low stock",
    stable: "Stable",
    batch: "Batch",
    expires: "Expires",
    units: "units",
    sell: "sell",
    adjustmentForm: "Adjustment Form",
    adjustmentFormDescription:
      "Every change writes an adjustment record, stock movement, and audit event.",
    nearExpiry: "Near expiry",
    available: "Available",
    currentQuantity: "Current quantity",
    sellingPrice: "Selling price",
    quantityDelta: "Quantity delta",
    reason: "Reason",
    notes: "Notes",
    notesPlaceholder: "Add a short explanation for the adjustment.",
    savingAdjustment: "Saving adjustment…",
    recordAdjustment: "Record Adjustment",
    reasonCountCorrection: "Count correction",
    reasonCountCorrectionHint: "Use when physical count differs from the system.",
    reasonTheftSuspected: "Theft suspected",
    reasonTheftSuspectedHint: "Record unexplained loss that needs review.",
    reasonLost: "Lost stock",
    reasonLostHint: "Record missing stock that cannot be accounted for.",
    reasonDamaged: "Damaged",
    reasonDamagedHint: "Remove unusable stock from the sellable pool.",
    reasonExpired: "Expired",
    reasonExpiredHint: "Retire batches that can no longer be dispensed.",
    reasonReturnToSupplier: "Return to supplier",
    reasonReturnToSupplierHint: "Track stock sent back upstream.",
    reasonOther: "Other",
    reasonOtherHint: "Use only if none of the standard reasons fit.",
    selectBatchFirst: "Select a batch first",
    selectBatchFirstDescription:
      "Pick a medicine and batch from the left so the adjustment can be tied to real stock.",
    recentAdjustments: "Recent Adjustments",
    recentAdjustmentsDescription:
      "The last recorded stock corrections for this branch.",
    noAdjustmentsYet: "No adjustments yet",
    noAdjustmentsYetDescription:
      "As soon as staff correct stock or record losses, the latest adjustments will appear here.",
  },
  am: {
    loadingStockAdjustments: "የእቃ ማስተካከያዎች በመጫን ላይ…",
    selectBatchBeforeAdjustment: "ማስተካከያ ከመመዝገብዎ በፊት ባች ይምረጡ።",
    enterWholeNumberAdjustment: "እንደ -2 ወይም 3 ያለ ሙሉ ቁጥር ማስተካከያ ያስገቡ።",
    adjustmentSavedMessage: "{medicine} ባች {batch} በ {delta} ዩኒት ተስተካክሏል።",
    adjustmentEvents: "የማስተካከያ ክስተቶች",
    recentAdjustmentRecords: "የቅርብ የማስተካከያ መዝገቦች",
    negativeMoves: "አሉታዊ እንቅስቃሴዎች",
    lossesExpiryDamageReturns: "ጉድለት፣ ማብቂያ፣ ጉዳት እና መመለሻዎች",
    suspectedLoss: "የተጠረጠረ ጉድለት",
    lostOrTheftSuspected: "የጠፉ ወይም የስርቆት ጥርጣሬ ክስተቶች",
    netUnitsDelta: "የተጣራ የዩኒት ልዩነት",
    positiveCorrections: "አዎንታዊ ማስተካከያዎች",
    stockAdjustments: "የእቃ ማስተካከያዎች",
    stockAdjustmentsDescription: "ጉድለቶችን፣ ማስተካከያዎችን፣ የማብቂያ ጥፋቶችን እና የአቅራቢ መመለሻዎችን በምክንያት ይመዝግቡ።",
    searchPlaceholder: "መድሃኒቶችን ወይም ባች ቁጥሮችን ይፈልጉ…",
    noStockedMedicines: "እቃ ያላቸው መድሃኒቶች የሉም",
    noStockedMedicinesDescription: "ለማስተካከል ንቁ ባቾች እንዲኖሩ መጀመሪያ እቃ ይቀበሉ።",
    catalogMedicine: "የካታሎግ መድሃኒት",
    lowStock: "ዝቅተኛ እቃ",
    stable: "የተረጋጋ",
    batch: "ባች",
    expires: "የሚያልቀው",
    units: "ዩኒቶች",
    sell: "ሽያጭ",
    adjustmentForm: "የማስተካከያ ቅጽ",
    adjustmentFormDescription: "እያንዳንዱ ለውጥ የማስተካከያ መዝገብ፣ የእቃ እንቅስቃሴ እና የኦዲት ክስተት ይጽፋል።",
    nearExpiry: "በቅርብ ማብቂያ",
    available: "የሚገኝ",
    currentQuantity: "የአሁኑ ብዛት",
    sellingPrice: "የመሸጫ ዋጋ",
    quantityDelta: "የብዛት ልዩነት",
    reason: "ምክንያት",
    notes: "ማስታወሻዎች",
    notesPlaceholder: "ለማስተካከያው አጭር ማብራሪያ ያክሉ።",
    savingAdjustment: "ማስተካከያው በማስቀመጥ ላይ…",
    recordAdjustment: "ማስተካከያውን መዝግብ",
    reasonCountCorrection: "የቆጠራ ማስተካከያ",
    reasonCountCorrectionHint: "የአካል ቆጠራ ከሲስተሙ ሲለይ ይጠቀሙ።",
    reasonTheftSuspected: "ስርቆት ተጠርጥሯል",
    reasonTheftSuspectedHint: "ግምገማ የሚፈልግ ያልተብራራ ጉድለት ይመዝግቡ።",
    reasonLost: "የጠፋ እቃ",
    reasonLostHint: "ምክንያት ሊገለጽ የማይችል የጠፋ እቃ ይመዝግቡ።",
    reasonDamaged: "የተጎዳ",
    reasonDamagedHint: "የማይሸጥ እቃን ከሚሸጥ እቃ ስብስብ ውስጥ ያስወግዱ።",
    reasonExpired: "ያለቀ",
    reasonExpiredHint: "ከእንግዲህ ሊሰጡ የማይችሉ ባቾችን ያገለሉ።",
    reasonReturnToSupplier: "ወደ አቅራቢ መመለስ",
    reasonReturnToSupplierHint: "ወደ ላይ የተመለሰ እቃ ይከታተሉ።",
    reasonOther: "ሌላ",
    reasonOtherHint: "መደበኛ ምክንያቶቹ ካልሰሩ ብቻ ይጠቀሙ።",
    selectBatchFirst: "መጀመሪያ ባች ይምረጡ",
    selectBatchFirstDescription: "ማስተካከያው ከእውነተኛ እቃ ጋር እንዲገናኝ ከግራው መድሃኒት እና ባች ይምረጡ።",
    recentAdjustments: "የቅርብ ማስተካከያዎች",
    recentAdjustmentsDescription: "ለዚህ ቅርንጫፍ በቅርቡ የተመዘገቡ የእቃ ማስተካከያዎች።",
    noAdjustmentsYet: "ማስተካከያ እስካሁን የለም",
    noAdjustmentsYetDescription: "ሰራተኞች እቃን ሲያስተካክሉ ወይም ጉድለት ሲመዘግቡ የቅርብ ማስተካከያዎች እዚህ ይታያሉ።",
  },
  om: {
    loadingStockAdjustments: "Sirreeffamoonni kuusaa fe'amaa jiru…",
    selectBatchBeforeAdjustment: "Sirreeffama galmeessu dura baachii filadhu.",
    enterWholeNumberAdjustment: "Sirreeffama guutuu lakkoofsa fakkeenyaaf -2 yookaan 3 galchi.",
    adjustmentSavedMessage: "{medicine} baachiin {batch} yuunitii {delta}n sirreeffameera.",
    adjustmentEvents: "Taateewwan Sirreeffamaa",
    recentAdjustmentRecords: "Galmeewwan sirreeffamaa yeroo dhiyoo",
    negativeMoves: "Sochiiwwan Hamaa",
    lossesExpiryDamageReturns: "Badiinsa, xumuramuu, miidhaa fi deebisa",
    suspectedLoss: "Badiinsa Shakkame",
    lostOrTheftSuspected: "Taateewwan dhabamuu yookaan hatamuu shakkaman",
    netUnitsDelta: "Garaagarummaa Yuunitii Saafaa",
    positiveCorrections: "sirreeffamoota gaarii",
    stockAdjustments: "Sirreeffamoota Kuusaa",
    stockAdjustmentsDescription: "Badiinsa, sirreeffama, xumuramuu fi deebisa dhiyeessaa sababaan galmeessi.",
    searchPlaceholder: "Qoricha yookaan lakkoofsa baachii barbaadi…",
    noStockedMedicines: "Qorichi kuusaa qabu hin jiru",
    noStockedMedicinesDescription: "Sirreessuuf baachiiwwan hojii irra jiran akka jiraatan dura kuusaa fudhadhu.",
    catalogMedicine: "Qoricha kaataalogii",
    lowStock: "Kuusaa Gadi Aanaa",
    stable: "Tasgabbaa'aa",
    batch: "Baachii",
    expires: "Xumura",
    units: "yuunitii",
    sell: "gurguri",
    adjustmentForm: "Unka Sirreeffamaa",
    adjustmentFormDescription: "Jijjiiramni hundi galmee sirreeffamaa, sochii kuusaa fi taatee odiitii ni barreessa.",
    nearExpiry: "Xumuramuu Dhiyaataa",
    available: "Ni argama",
    currentQuantity: "Baay'ina ammaa",
    sellingPrice: "Gatii gurgurtaa",
    quantityDelta: "Garaagarummaa baay'inaa",
    reason: "Sababa",
    notes: "Yaadannoo",
    notesPlaceholder: "Sirreeffamichaaf ibsa gabaabaa dabali.",
    savingAdjustment: "Sirreeffamni olkaa'amaa jira…",
    recordAdjustment: "Sirreeffama Galmeessi",
    reasonCountCorrection: "Sirreeffama lakkoofsaa",
    reasonCountCorrectionHint: "Yeroo lakkoofsi qaamaa kan sirnaa irraa adda ta'u itti fayyadami.",
    reasonTheftSuspected: "Hannaan shakkame",
    reasonTheftSuspectedHint: "Badiinsa hin ibsamne kan sakatta'iinsa barbaadu galmeessi.",
    reasonLost: "Kuusaa bade",
    reasonLostHint: "Kuusaa dhabame kan ibsa hin qabne galmeessi.",
    reasonDamaged: "Miidhame",
    reasonDamagedHint: "Kuusaa gurguramuu hin dandeenye keessaa baasi.",
    reasonExpired: "Xumurame",
    reasonExpiredHint: "Baachiiwwan kana booda kennamuu hin dandeenye hojii irraa baasi.",
    reasonReturnToSupplier: "Gara dhiyeessaatti deebisi",
    reasonReturnToSupplierHint: "Kuusaa gara gubbaatti deebi'e hordofi.",
    reasonOther: "Kan biraa",
    reasonOtherHint: "Sababoonni idilee yoo hin taane qofa fayyadami.",
    selectBatchFirst: "Dursee baachii filadhu",
    selectBatchFirstDescription: "Sirreeffamni kuusaa dhugaa irratti akka hidhatuuf qoricha fi baachii irraa fili.",
    recentAdjustments: "Sirreeffamoota Yeroo Dhihoo",
    recentAdjustmentsDescription: "Sirreeffamoota kuusaa yeroo dhiyoo damee kanaaf galmaa'an.",
    noAdjustmentsYet: "Ammaaf sirreeffamni hin jiru",
    noAdjustmentsYetDescription: "Yeroo hojjettoonni kuusaa sirreessan yookaan badiinsa galmeessan sirreeffamoonni yeroo dhiyoo asitti mul'atu.",
  },
} as const;
