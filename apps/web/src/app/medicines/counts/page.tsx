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
  formatDate,
  formatNumber,
} from "../../i18n/format";
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
  const { locale } = useI18n();
  const text = COUNTS_COPY[locale] as (typeof COUNTS_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<CycleCountCatalogResponse | null>(null);
  const [history, setHistory] = useState<CycleCountsResponse | null>(null);
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [requestedBatchId, setRequestedBatchId] = useState<string | null>(null);
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
    setRequestedBatchId(params.get("stockBatchId"));
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

    const requestedBatch =
      requestedBatchId
        ? catalog.batches.find((batch) => batch.stockBatchId === requestedBatchId)
        : null;
    const preferredBatch = requestedMedicineId
      ? catalog.batches.find((batch) => batch.medicineId === requestedMedicineId)
      : null;

    if (!selectedBatchId) {
      setSelectedBatchId(
        requestedBatch?.stockBatchId ??
          preferredBatch?.stockBatchId ??
          catalog.batches[0]?.stockBatchId ??
          ""
      );
      return;
    }

    const stillExists = catalog.batches.some((batch) => batch.stockBatchId === selectedBatchId);

    if (!stillExists) {
      setSelectedBatchId(
        requestedBatch?.stockBatchId ??
          preferredBatch?.stockBatchId ??
          catalog.batches[0]?.stockBatchId ??
          ""
      );
    }
  }, [catalog, requestedBatchId, requestedMedicineId, selectedBatchId]);

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
      setError(text.selectBatchBeforeSave);
      return;
    }

    if (!Number.isInteger(parsedCountedQuantity) || parsedCountedQuantity < 0) {
      setError(text.countMustBeWholeNumber);
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
        text.countSavedMessage
          .replace("{medicine}", result.medicine.name)
          .replace("{batch}", result.batchNumber)
          .replace("{count}", formatNumber(result.countedQuantity, locale))
          .replace("{delta}", formatSignedNumber(result.quantityDelta))
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
    return <AppLoading message={text.loadingStockCounts} />;
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
            label={text.countableBatches}
            value={String(metrics.totalBatches)}
            note={`${formatNumber(metrics.totalUnitsOnHand, locale)} ${text.unitsInScope}`}
          />
          <KpiCard
            label={text.expiringSoon}
            value={String(metrics.expiringSoonBatchCount)}
            valueColor="#6e3900"
            note={text.priorityReview}
          />
          <KpiCard
            label={text.lowStockMedicines}
            value={String(metrics.lowStockMedicineCount)}
            valueColor="#93000a"
            note={text.usefulForCycleCountFocus}
          />
          <KpiCard
            label={text.countEvents}
            value={String(historyMetrics.countEvents)}
            note={`${formatNumber(historyMetrics.matchedCount, locale)} ${text.exactMatches}`}
          />
          <KpiCard
            label={text.netVariance}
            value={formatSignedNumber(historyMetrics.netVarianceUnits)}
            valueColor={historyMetrics.netVarianceUnits < 0 ? "#93000a" : "#004253"}
            note={`${formatNumber(historyMetrics.shortageEvents, locale)} ${text.shortages} / ${formatNumber(historyMetrics.overageEvents, locale)} ${text.overages}`}
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
                  {text.physicalStockCount}
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.physicalStockCountDescription}
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
                  placeholder={text.searchPlaceholder}
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
                              .join(" • ") || text.catalogMedicine}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {batch.isExpiringSoon ? (
                            <StatusBadge label={text.nearExpiry} tone="warning" />
                          ) : null}
                          <StatusBadge
                            label={batch.isLowStock ? text.lowStock : text.inStock}
                            tone={batch.isLowStock ? "danger" : "success"}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-xs md:grid-cols-4">
                        <Metric label={text.batch} value={batch.batchNumber} />
                        <Metric
                          label={text.systemQty}
                          value={formatNumber(batch.systemQuantity, locale)}
                        />
                        <Metric
                          label={text.medicineTotal}
                          value={formatNumber(batch.totalMedicineQuantity, locale)}
                        />
                        <Metric
                          label={text.expiry}
                          value={formatDate(batch.expiryDate, locale)}
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
                  title={text.noActiveBatchesToCount}
                  description={text.noActiveBatchesToCountDescription}
                />
              </div>
            )}
          </SurfaceCard>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">{text.countEntry}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.countEntryDescription}
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
                          {text.batch} {selectedBatch.batchNumber} • {formatDate(selectedBatch.expiryDate, locale)}
                        </p>
                      </div>

                      <StatusBadge
                        label={selectedBatch.isExpiringSoon ? text.priorityCount : text.ready}
                        tone={selectedBatch.isExpiringSoon ? "warning" : "success"}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <InfoPair label={text.systemQuantity} value={formatNumber(selectedBatch.systemQuantity, locale)} />
                      <InfoPair
                        label={text.variancePreview}
                        value={formatSignedNumber(variance)}
                      />
                    </div>
                  </div>

                  <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-on-surface">
                        {text.countedQuantity}
                      </span>
                      <input
                        value={countedQuantity}
                        onChange={(event) => setCountedQuantity(event.target.value)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.zero}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-on-surface">
                        {text.notes}
                      </span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.notesPlaceholder}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    >
                      {isSubmitting ? text.savingCount : text.saveCount}
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
                <h2 className="text-[1rem] font-bold text-on-surface">{text.recentCounts}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.recentCountsDescription}
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
                            {text.batch} {item.batchNumber} • {item.createdBy}
                          </p>
                        </div>
                        <StatusBadge
                          label={
                            item.varianceType === "MATCH"
                              ? text.match
                              : item.varianceType === "SHORTAGE"
                                ? text.shortage
                                : text.overage
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
                        {text.system} {formatNumber(item.previousQuantity, locale)} → {text.counted} {formatNumber(item.countedQuantity, locale)} (
                        {formatSignedNumber(item.quantityDelta)})
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noCycleCountsYet}
                  description={text.noCycleCountsYetDescription}
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

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

const COUNTS_COPY = {
  en: {
    loadingStockCounts: "Loading stock counts…",
    selectBatchBeforeSave: "Select a batch before saving a stock count.",
    countMustBeWholeNumber:
      "Counted quantity must be a whole number greater than or equal to zero.",
    countSavedMessage:
      "{medicine} batch {batch} counted at {count} units ({delta}).",
    countableBatches: "Countable Batches",
    unitsInScope: "units in scope",
    expiringSoon: "Expiring Soon",
    priorityReview: "Batches needing priority review",
    lowStockMedicines: "Low Stock Medicines",
    usefulForCycleCountFocus: "Useful for cycle count focus",
    countEvents: "Count Events",
    exactMatches: "exact matches",
    netVariance: "Net Variance",
    shortages: "shortages",
    overages: "overages",
    physicalStockCount: "Physical Stock Count",
    physicalStockCountDescription:
      "Compare shelf count to system count batch by batch and record the result.",
    searchPlaceholder: "Search medicine or batch…",
    catalogMedicine: "Catalog medicine",
    nearExpiry: "Near expiry",
    lowStock: "Low stock",
    inStock: "In stock",
    batch: "Batch",
    systemQty: "System Qty",
    medicineTotal: "Medicine Total",
    expiry: "Expiry",
    noActiveBatchesToCount: "No active batches to count",
    noActiveBatchesToCountDescription:
      "Receive stock first so the count workflow has live batches to compare.",
    countEntry: "Count Entry",
    countEntryDescription:
      "Record the quantity physically found on the shelf for the selected batch.",
    priorityCount: "Priority count",
    ready: "Ready",
    systemQuantity: "System quantity",
    variancePreview: "Variance preview",
    countedQuantity: "Counted quantity",
    zero: "0",
    notes: "Notes",
    notesPlaceholder: "Optional count notes or shelf location details.",
    savingCount: "Saving count…",
    saveCount: "Save Count",
    selectBatchFirst: "Select a batch first",
    selectBatchFirstDescription:
      "Choose a batch from the left so we can compare physical stock to the system quantity.",
    recentCounts: "Recent Counts",
    recentCountsDescription:
      "Latest physical count records captured for this branch.",
    match: "Match",
    shortage: "Shortage",
    overage: "Overage",
    system: "System",
    counted: "Counted",
    noCycleCountsYet: "No cycle counts yet",
    noCycleCountsYetDescription:
      "Saved counts will appear here so supervisors can review the latest variance decisions.",
  },
  am: {
    loadingStockCounts: "የእቃ ቆጠራዎች በመጫን ላይ…",
    selectBatchBeforeSave: "የእቃ ቆጠራ ከማስቀመጥዎ በፊት ባች ይምረጡ።",
    countMustBeWholeNumber: "የተቆጠረው ብዛት ከዜሮ በላይ ወይም እኩል የሆነ ሙሉ ቁጥር መሆን አለበት።",
    countSavedMessage: "{medicine} ባች {batch} በ {count} ዩኒት ተቆጥሯል ({delta})።",
    countableBatches: "ሊቆጠሩ የሚችሉ ባቾች",
    unitsInScope: "በክልሉ ውስጥ ያሉ ዩኒቶች",
    expiringSoon: "በቅርቡ የሚያልቁ",
    priorityReview: "ቅድሚያ ግምገማ የሚፈልጉ ባቾች",
    lowStockMedicines: "ዝቅተኛ እቃ ያላቸው መድሃኒቶች",
    usefulForCycleCountFocus: "ለቆጠራ ትኩረት የሚጠቅም",
    countEvents: "የቆጠራ ክስተቶች",
    exactMatches: "ትክክለኛ ግጥሞች",
    netVariance: "የተጣራ ልዩነት",
    shortages: "ጉድለቶች",
    overages: "ተጨማሪዎች",
    physicalStockCount: "የአካል እቃ ቆጠራ",
    physicalStockCountDescription: "የሸልፍ ቆጠራን ከሲስተሙ ቆጠራ ጋር በባች ያነጻጽሩ እና ውጤቱን ይመዝግቡ።",
    searchPlaceholder: "መድሃኒት ወይም ባች ይፈልጉ…",
    catalogMedicine: "የካታሎግ መድሃኒት",
    nearExpiry: "በቅርብ ማብቂያ",
    lowStock: "ዝቅተኛ እቃ",
    inStock: "በእቃ ላይ ያለ",
    batch: "ባች",
    systemQty: "የሲስተም ብዛት",
    medicineTotal: "የመድሃኒቱ ጠቅላላ",
    expiry: "ማብቂያ",
    noActiveBatchesToCount: "ለመቆጠር ንቁ ባቾች የሉም",
    noActiveBatchesToCountDescription: "የቆጠራ ስርዓቱ እውነተኛ ባቾችን እንዲያነጻጽር መጀመሪያ እቃ ይቀበሉ።",
    countEntry: "የቆጠራ ግቤት",
    countEntryDescription: "ለተመረጠው ባች በሸልፍ ላይ በአካል የተገኘውን ብዛት ይመዝግቡ።",
    priorityCount: "ቅድሚያ ቆጠራ",
    ready: "ዝግጁ",
    systemQuantity: "የሲስተም ብዛት",
    variancePreview: "የልዩነት ቅድመ እይታ",
    countedQuantity: "የተቆጠረ ብዛት",
    zero: "0",
    notes: "ማስታወሻዎች",
    notesPlaceholder: "አማራጭ የቆጠራ ማስታወሻዎች ወይም የሸልፍ ቦታ ዝርዝሮች።",
    savingCount: "ቆጠራው በማስቀመጥ ላይ…",
    saveCount: "ቆጠራውን አስቀምጥ",
    selectBatchFirst: "መጀመሪያ ባች ይምረጡ",
    selectBatchFirstDescription: "የአካል እቃን ከሲስተሙ ብዛት ጋር ለማነጻጸር ከግራው ያለውን ባች ይምረጡ።",
    recentCounts: "የቅርብ ቆጠራዎች",
    recentCountsDescription: "ለዚህ ቅርንጫፍ የተመዘገቡ የቅርብ የአካል ቆጠራ መዝገቦች።",
    match: "ተዛማጅ",
    shortage: "ጉድለት",
    overage: "ተጨማሪ",
    system: "ሲስተም",
    counted: "የተቆጠረ",
    noCycleCountsYet: "የዙር ቆጠራ እስካሁን የለም",
    noCycleCountsYetDescription: "የተቀመጡ ቆጠራዎች ተቆጣጣሪዎች የቅርብ የልዩነት ውሳኔዎችን እንዲገምግሙ እዚህ ይታያሉ።",
  },
  om: {
    loadingStockCounts: "Lakkoofsawwan kuusaa fe'amaa jiru…",
    selectBatchBeforeSave: "Lakkoofsa kuusaa olkaa'uu dura baachii filadhu.",
    countMustBeWholeNumber: "Baay'inni lakkaa'ame guutuu lakkoofsa ta'uu qaba, zeeroo ol yookaan wal qixa.",
    countSavedMessage: "{medicine} baachiin {batch} yuunitii {count}n lakkaa'ameera ({delta}).",
    countableBatches: "Baachiiwwan Lakkaa'amoo",
    unitsInScope: "yuunitii daangaa keessatti",
    expiringSoon: "Dhihootti Xumuramu",
    priorityReview: "Baachiiwwan ilaalcha dursa barbaadan",
    lowStockMedicines: "Qorichoota Kuusaan Gadi Aanaa",
    usefulForCycleCountFocus: "Xiyyeeffannoo lakkoofsaaf ni gargaara",
    countEvents: "Taateewwan Lakkoofsaa",
    exactMatches: "wal qabsiisni sirrii",
    netVariance: "Garaagarummaa Saafaa",
    shortages: "hanqinoota",
    overages: "dabalata",
    physicalStockCount: "Lakkoofsa Kuusaa Qaamaa",
    physicalStockCountDescription: "Lakkoofsa rafuu irraa kan qaamaa fi kan sirnaa baachii baachiidhaan wal bira qabi, bu'aas galmeessi.",
    searchPlaceholder: "Qoricha yookaan baachii barbaadi…",
    catalogMedicine: "Qoricha kaataalogii",
    nearExpiry: "Xumuramuu Dhiyaataa",
    lowStock: "Kuusaa Gadi Aanaa",
    inStock: "Kuusaa keessa jira",
    batch: "Baachii",
    systemQty: "Baay'ina Sirnaa",
    medicineTotal: "Waliigala Qorichaa",
    expiry: "Xumuramuu",
    noActiveBatchesToCount: "Baachiiwwan hojii irra jiran lakkaa'amu hin jiran",
    noActiveBatchesToCountDescription: "Lakkoofsi kun baachiiwwan dhugaa wal bira qabuuf dura kuusaa fudhadhu.",
    countEntry: "Galmee Lakkoofsaa",
    countEntryDescription: "Baay'ina baachii filatameef rafuu irratti qaamaan argame galmeessi.",
    priorityCount: "Lakkoofsa dursa",
    ready: "Qophaa'eera",
    systemQuantity: "Baay'ina sirnaa",
    variancePreview: "Agarsiisa dura garaagarummaa",
    countedQuantity: "Baay'ina lakkaa'ame",
    zero: "0",
    notes: "Yaadannoowwan",
    notesPlaceholder: "Yaadannoo lakkoofsaa yookaan iddoo rafuu filannoo.",
    savingCount: "Lakkoofsi olkaa'amaa jira…",
    saveCount: "Lakkoofsa Olkaa'i",
    selectBatchFirst: "Dursee baachii filadhu",
    selectBatchFirstDescription: "Baachii keessaa tokko filachuun kuusaa qaamaa fi baay'ina sirnaa wal bira qabna.",
    recentCounts: "Lakkoofsawwan Yeroo Dhihoo",
    recentCountsDescription: "Galmeewwan lakkoofsa qaamaa yeroo dhiyoo damee kanaaf qabaman.",
    match: "Wal fakkaata",
    shortage: "Hanqina",
    overage: "Dabalata",
    system: "Sirna",
    counted: "Lakkaa'ame",
    noCycleCountsYet: "Ammaaf lakkoofsi cycle hin jiru",
    noCycleCountsYetDescription: "Lakkoofsawwan olkaa'aman asitti mul'atu, hoggantoonni murtee garaagarummaa yeroo dhiyoo akka ilaalan.",
  },
} as const;
