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
  formatNumber,
  formatRelativeTime,
} from "../../i18n/format";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type CreateDisposalResponse,
  type DisposalCatalogResponse,
  type InventoryDisposalsResponse,
  type SessionResponse,
} from "../../lib/api";

type DisposalReason = CreateDisposalResponse["reason"];

export default function DisposalsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = DISPOSAL_COPY[locale] as (typeof DISPOSAL_COPY)["en"];
  const reasonOptions = getReasonOptions(text);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<DisposalCatalogResponse | null>(null);
  const [history, setHistory] = useState<InventoryDisposalsResponse | null>(null);
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<DisposalReason>("DAMAGE");
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
      setSelectedBatchId(
        preferredBatch?.stockBatchId ?? catalog.batches[0]?.stockBatchId ?? ""
      );
      return;
    }

    const stillExists = catalog.batches.some(
      (batch) => batch.stockBatchId === selectedBatchId
    );

    if (!stillExists) {
      setSelectedBatchId(
        preferredBatch?.stockBatchId ?? catalog.batches[0]?.stockBatchId ?? ""
      );
    }
  }, [catalog, requestedMedicineId, selectedBatchId]);

  const selectedBatch =
    catalog?.batches.find((batch) => batch.stockBatchId === selectedBatchId) ?? null;

  useEffect(() => {
    if (!selectedBatch) {
      return;
    }

    if (reason === "RETURN_TO_SUPPLIER" && !selectedBatch.canReturnToSupplier) {
      setReason(selectedBatch.isExpired ? "EXPIRED" : "DAMAGE");
    }
  }, [reason, selectedBatch]);

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
        fetchJson<DisposalCatalogResponse>("/inventory/disposal-catalog", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<InventoryDisposalsResponse>("/inventory/disposals", {
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
      fetchJson<DisposalCatalogResponse>("/inventory/disposal-catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<InventoryDisposalsResponse>("/inventory/disposals", {
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
        batch.batchNumber.toLowerCase().includes(query) ||
        (batch.supplierName ?? "").toLowerCase().includes(query)
      );
    });
  }, [catalog?.batches, search]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const parsedQuantity = Number(quantity);

    if (!selectedBatch) {
      setError(text.selectBatchBeforeSave);
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setError(text.quantityMustBeWholeNumber);
      return;
    }

    if (parsedQuantity > selectedBatch.quantityOnHand) {
      setError(
        text.quantityExceedsStock.replace(
          "{count}",
          formatNumber(selectedBatch.quantityOnHand, locale)
        )
      );
      return;
    }

    if (reason === "RETURN_TO_SUPPLIER" && !selectedBatch.canReturnToSupplier) {
      setError(text.batchCannotBeReturned);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<CreateDisposalResponse>("/inventory/disposals", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          stockBatchId: selectedBatch.stockBatchId,
          quantity: parsedQuantity,
          reason,
          notes: notes.trim() || undefined,
        }),
      });

      setSuccessMessage(
        text.disposalSavedMessage
          .replace("{medicine}", result.medicine.name)
          .replace("{batch}", result.batch.batchNumber)
          .replace("{count}", formatNumber(result.quantityRemoved, locale))
      );
      setQuantity("1");
      setNotes("");

      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <AppLoading message={text.loadingWorkspace} />;
  }

  if (!session) {
    return null;
  }

  const catalogMetrics = catalog?.metrics ?? {
    totalBatches: 0,
    totalUnitsOnHand: 0,
    expiredBatchCount: 0,
    expiringSoonBatchCount: 0,
    returnableBatchCount: 0,
  };

  const historyMetrics = history?.metrics ?? {
    totalDisposals: 0,
    damagedCount: 0,
    expiredCount: 0,
    returnedCount: 0,
    totalUnitsRemoved: 0,
    totalRetailValueRemoved: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label={text.kpiEligibleBatches}
            value={formatNumber(catalogMetrics.totalBatches, locale)}
            note={`${formatNumber(catalogMetrics.totalUnitsOnHand, locale)} ${text.unitsEligible}`}
          />
          <KpiCard
            label={text.kpiExpiredBatches}
            value={formatNumber(catalogMetrics.expiredBatchCount, locale)}
            valueColor="#93000a"
            note={text.expiredNeedImmediateAction}
          />
          <KpiCard
            label={text.kpiReturnableBatches}
            value={formatNumber(catalogMetrics.returnableBatchCount, locale)}
            note={text.batchesWithSupplierTrace}
          />
          <KpiCard
            label={text.kpiDisposals}
            value={formatNumber(historyMetrics.totalDisposals, locale)}
            note={`${formatNumber(historyMetrics.totalUnitsRemoved, locale)} ${text.unitsRemoved}`}
          />
          <KpiCard
            label={text.kpiRetailValueRemoved}
            value={`ETB ${formatCurrency(historyMetrics.totalRetailValueRemoved, locale)}`}
            valueColor="#6e3900"
            note={`${formatNumber(historyMetrics.returnedCount, locale)} ${text.returnedToSuppliers}`}
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
                  {text.title}
                </h1>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {text.subtitle.replace(
                    "{branch}",
                    catalog?.branch.name ?? session.branch?.name ?? text.defaultBranch
                  )}
                </p>
              </div>

              <div className="relative ml-auto min-w-[260px] flex-1 max-w-[360px]">
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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={text.searchPlaceholder}
                  className="h-10 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-on-surface">
                    {text.catalogTitle}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {text.catalogDescription}
                  </p>
                </div>
                <StatusBadge
                  label={`${formatNumber(catalogMetrics.expiringSoonBatchCount, locale)} ${text.expiryRisk}`}
                  tone="warning"
                />
              </div>

              {filteredBatches.length === 0 ? (
                <EmptyStateCard
                  compact
                  title={text.emptyCatalogTitle}
                  description={text.emptyCatalogDescription}
                />
              ) : (
                <div className="space-y-3">
                  {filteredBatches.map((batch) => {
                    const active = batch.stockBatchId === selectedBatchId;

                    return (
                      <button
                        key={batch.stockBatchId}
                        type="button"
                        onClick={() => setSelectedBatchId(batch.stockBatchId)}
                        className={[
                          "w-full rounded-xl border px-4 py-4 text-left transition-all",
                          active
                            ? "border-primary bg-primary/[0.05]"
                            : "border-outline/10 bg-surface hover:border-primary/20 hover:bg-primary/[0.02]",
                        ].join(" ")}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-on-surface">
                                {batch.medicineName}
                              </p>
                              {batch.isExpired ? (
                                <StatusBadge label={text.statusExpired} tone="danger" />
                              ) : batch.isExpiringSoon ? (
                                <StatusBadge label={text.statusExpiringSoon} tone="warning" />
                              ) : null}
                              {batch.canReturnToSupplier ? (
                                <StatusBadge label={text.statusReturnable} tone="info" />
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {batch.form ?? text.notAvailable}
                              {batch.strength ? ` • ${batch.strength}` : ""}
                              {batch.genericName ? ` • ${batch.genericName}` : ""}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-semibold text-on-surface">
                              {formatNumber(batch.quantityOnHand, locale)} {batch.unit ?? text.units}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              ETB {formatCurrency(batch.estimatedRetailValue, locale)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-on-surface-variant md:grid-cols-4">
                          <p>
                            <span className="font-semibold text-on-surface">{text.batchLabel}</span>{" "}
                            {batch.batchNumber}
                          </p>
                          <p>
                            <span className="font-semibold text-on-surface">{text.expiryLabel}</span>{" "}
                            {formatDate(batch.expiryDate, locale)}
                          </p>
                          <p>
                            <span className="font-semibold text-on-surface">{text.receivedLabel}</span>{" "}
                            {formatDate(batch.receivedAt, locale)}
                          </p>
                          <p>
                            <span className="font-semibold text-on-surface">{text.supplierLabel}</span>{" "}
                            {batch.supplierName ?? text.notAvailable}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </SurfaceCard>

          <div className="space-y-6">
            <SurfaceCard className="p-5">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-on-surface">{text.formTitle}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.formDescription}
                </p>
              </div>

              {selectedBatch ? (
                <>
                  <div className="mb-5 rounded-xl bg-surface p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {selectedBatch.medicineName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {text.batchLabel} {selectedBatch.batchNumber}
                        </p>
                      </div>
                      <StatusBadge
                        label={
                          selectedBatch.isExpired
                            ? text.statusExpired
                            : selectedBatch.isExpiringSoon
                              ? text.statusExpiringSoon
                              : text.statusEligible
                        }
                        tone={
                          selectedBatch.isExpired
                            ? "danger"
                            : selectedBatch.isExpiringSoon
                              ? "warning"
                              : "success"
                        }
                      />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-on-surface-variant">
                      <p>
                        <span className="font-semibold text-on-surface">{text.unitsOnHandLabel}</span>{" "}
                        {formatNumber(selectedBatch.quantityOnHand, locale)}
                      </p>
                      <p>
                        <span className="font-semibold text-on-surface">{text.expiryLabel}</span>{" "}
                        {formatDate(selectedBatch.expiryDate, locale)}
                      </p>
                      <p>
                        <span className="font-semibold text-on-surface">{text.supplierLabel}</span>{" "}
                        {selectedBatch.supplierName ?? text.notAvailable}
                      </p>
                    </div>
                  </div>

                  <form className="space-y-4" onSubmit={handleSubmit}>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {text.quantityField}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={selectedBatch.quantityOnHand}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {text.reasonField}
                      </span>
                      <select
                        value={reason}
                        onChange={(event) => setReason(event.target.value as DisposalReason)}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {reasonOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={
                              option.value === "RETURN_TO_SUPPLIER" &&
                              !selectedBatch.canReturnToSupplier
                            }
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {!selectedBatch.canReturnToSupplier ? (
                      <p className="rounded-lg bg-tertiary-fixed px-3 py-2 text-xs text-on-tertiary-fixed-variant">
                        {text.returnUnavailableNote}
                      </p>
                    ) : null}

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {text.notesField}
                      </span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                        placeholder={text.notesPlaceholder}
                        className="w-full rounded-lg border border-outline/10 bg-surface px-3 py-3 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                    >
                      {isSubmitting ? text.submittingButton : text.submitButton}
                    </button>
                  </form>
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noBatchSelectedTitle}
                  description={text.noBatchSelectedDescription}
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-on-surface">{text.historyTitle}</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {text.historyDescription}
                  </p>
                </div>
                <StatusBadge
                  label={`${formatNumber(historyMetrics.damagedCount, locale)} ${text.damagedShort}`}
                  tone="danger"
                />
              </div>

              {!history?.disposals.length ? (
                <EmptyStateCard
                  compact
                  title={text.emptyHistoryTitle}
                  description={text.emptyHistoryDescription}
                />
              ) : (
                <div className="space-y-3">
                  {history.disposals.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-outline/10 bg-surface px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-on-surface">
                              {item.medicine.name}
                            </p>
                            <StatusBadge
                              label={getReasonLabel(item.reason, text)}
                              tone={getReasonTone(item.reason)}
                            />
                          </div>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {text.batchLabel} {item.batch.batchNumber}
                            {item.batch.supplierName
                              ? ` • ${text.supplierLabel} ${item.batch.supplierName}`
                              : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-on-surface">
                            -{formatNumber(item.quantityRemoved, locale)}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            ETB {formatCurrency(item.estimatedRetailValueRemoved, locale)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
                        <p>
                          {item.createdBy} • {formatRelativeTime(item.createdAt, locale)}
                        </p>
                        <p>
                          {text.remainingLabel}{" "}
                          {formatNumber(item.quantityAfter, locale)}
                        </p>
                      </div>

                      {item.notes ? (
                        <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getReasonOptions(text: (typeof DISPOSAL_COPY)["en"]) {
  return [
    { value: "DAMAGE" as const, label: text.reasonDamage },
    { value: "EXPIRED" as const, label: text.reasonExpired },
    { value: "RETURN_TO_SUPPLIER" as const, label: text.reasonReturnToSupplier },
  ];
}

function getReasonLabel(reason: DisposalReason, text: (typeof DISPOSAL_COPY)["en"]) {
  if (reason === "EXPIRED") {
    return text.reasonExpired;
  }

  if (reason === "RETURN_TO_SUPPLIER") {
    return text.reasonReturnToSupplier;
  }

  return text.reasonDamage;
}

function getReasonTone(reason: DisposalReason) {
  if (reason === "RETURN_TO_SUPPLIER") {
    return "info" as const;
  }

  if (reason === "EXPIRED") {
    return "warning" as const;
  }

  return "danger" as const;
}

const DISPOSAL_COPY = {
  en: {
    loadingWorkspace: "Loading returns and disposal workspace…",
    defaultBranch: "Main Branch",
    title: "Returns & Disposal",
    subtitle:
      "Remove damaged or expired stock safely, and return supplier-linked batches upstream for {branch}.",
    searchPlaceholder: "Search medicine, batch, or supplier…",
    kpiEligibleBatches: "Eligible Batches",
    kpiExpiredBatches: "Expired Batches",
    kpiReturnableBatches: "Returnable Batches",
    kpiDisposals: "Recorded Disposals",
    kpiRetailValueRemoved: "Retail Value Removed",
    unitsEligible: "units eligible",
    expiredNeedImmediateAction: "Require immediate review or write-off",
    batchesWithSupplierTrace: "Batches can be traced back to suppliers",
    unitsRemoved: "units removed",
    returnedToSuppliers: "returned to suppliers",
    catalogTitle: "Disposal Catalog",
    catalogDescription:
      "Choose a live batch, review expiry risk, and send it into the correct loss workflow.",
    expiryRisk: "expiry risk",
    emptyCatalogTitle: "No batches available",
    emptyCatalogDescription:
      "There is no on-hand stock available for disposal or return in this branch right now.",
    batchLabel: "Batch",
    expiryLabel: "Expiry",
    receivedLabel: "Received",
    supplierLabel: "Supplier",
    units: "units",
    statusExpired: "Expired",
    statusExpiringSoon: "Expiring Soon",
    statusReturnable: "Returnable",
    statusEligible: "Eligible",
    formTitle: "Record Disposal",
    formDescription:
      "Every removal writes an inventory adjustment, stock movement, and audit event.",
    unitsOnHandLabel: "Units on hand",
    quantityField: "Quantity",
    reasonField: "Reason",
    notesField: "Notes",
    notesPlaceholder: "Optional context for damage, expiry, or supplier return.",
    submitButton: "Save Disposal",
    submittingButton: "Saving disposal…",
    returnUnavailableNote:
      "This batch has no supplier reference, so supplier return is unavailable.",
    noBatchSelectedTitle: "Select a batch",
    noBatchSelectedDescription:
      "Choose a batch from the catalog to record damage, expiry, or return-to-supplier activity.",
    historyTitle: "Recent Disposal Activity",
    historyDescription:
      "Track recent write-offs and supplier returns with full accountability.",
    damagedShort: "damage",
    emptyHistoryTitle: "No disposal history yet",
    emptyHistoryDescription:
      "Recorded damage, expiry removals, and supplier returns will appear here.",
    remainingLabel: "Remaining",
    reasonDamage: "Damaged stock",
    reasonExpired: "Expired stock",
    reasonReturnToSupplier: "Return to supplier",
    selectBatchBeforeSave: "Select a batch before saving a disposal.",
    quantityMustBeWholeNumber:
      "Enter a whole-number quantity greater than zero before saving.",
    quantityExceedsStock: "Only {count} units are currently available in this batch.",
    batchCannotBeReturned:
      "This batch cannot be returned to a supplier because no supplier reference exists.",
    disposalSavedMessage:
      "{count} units removed from {medicine} batch {batch}.",
    notAvailable: "N/A",
  },
  am: {
    loadingWorkspace: "የመመለሻ እና ማስወገጃ ስራ ቦታ በመጫን ላይ…",
    defaultBranch: "ዋና ቅርንጫፍ",
    title: "መመለሻ እና ማስወገጃ",
    subtitle:
      "የተበላሹ ወይም የጊዜ ገደባቸው ያለፈ እቃዎችን በደህና ያስወግዱ፣ እና አቅራቢ የሚታወቁ ባቾችን ለ {branch} ወደ አቅራቢ ይመልሱ።",
    searchPlaceholder: "መድሃኒት፣ ባች ወይም አቅራቢ ይፈልጉ…",
    kpiEligibleBatches: "ተግባራዊ ባቾች",
    kpiExpiredBatches: "ያለፉ ባቾች",
    kpiReturnableBatches: "ሊመለሱ የሚችሉ ባቾች",
    kpiDisposals: "የተመዘገቡ ማስወገጃዎች",
    kpiRetailValueRemoved: "የተወገደ የሽያጭ ዋጋ",
    unitsEligible: "ተግባራዊ ዩኒቶች",
    expiredNeedImmediateAction: "ፈጣን ክትትል ወይም ማስወገጃ ይፈልጋሉ",
    batchesWithSupplierTrace: "ወደ አቅራቢ የሚመለሱ ባቾች",
    unitsRemoved: "የተወገዱ ዩኒቶች",
    returnedToSuppliers: "ወደ አቅራቢ የተመለሱ",
    catalogTitle: "የማስወገጃ ካታሎግ",
    catalogDescription:
      "ቀጥታ ባች ይምረጡ፣ የማብቂያ አደጋን ይመርምሩ፣ እና ወደ ትክክለኛው የኪሳራ ሂደት ያስገቡት።",
    expiryRisk: "የማብቂያ አደጋ",
    emptyCatalogTitle: "ምንም ባች የለም",
    emptyCatalogDescription:
      "በዚህ ቅርንጫፍ ለመመለሻ ወይም ለማስወገጃ የሚገኝ እቃ የለም።",
    batchLabel: "ባች",
    expiryLabel: "የማብቂያ ቀን",
    receivedLabel: "የተቀበለበት",
    supplierLabel: "አቅራቢ",
    units: "ዩኒቶች",
    statusExpired: "ያለፈ",
    statusExpiringSoon: "በቅርቡ የሚያልፍ",
    statusReturnable: "ሊመለስ የሚችል",
    statusEligible: "ተግባራዊ",
    formTitle: "ማስወገጃ መዝግብ",
    formDescription:
      "እያንዳንዱ ማስወገጃ የእቃ ማስተካከያ፣ የእንቅስቃሴ መዝገብ እና የኦዲት ክስተት ይፈጥራል።",
    unitsOnHandLabel: "ያሉ ዩኒቶች",
    quantityField: "ብዛት",
    reasonField: "ምክንያት",
    notesField: "ማስታወሻዎች",
    notesPlaceholder: "ለጉዳት፣ ለማብቂያ ወይም ለመመለሻ ተጨማሪ መረጃ።",
    submitButton: "ማስወገጃ አስቀምጥ",
    submittingButton: "ማስወገጃ በመቀመጥ ላይ…",
    returnUnavailableNote:
      "ይህ ባች የአቅራቢ መረጃ የለውም፣ ስለዚህ ወደ አቅራቢ መመለስ አይቻልም።",
    noBatchSelectedTitle: "ባች ይምረጡ",
    noBatchSelectedDescription:
      "ጉዳት፣ ማብቂያ ወይም ወደ አቅራቢ መመለሻ ለመመዝገብ ከካታሎጉ ባች ይምረጡ።",
    historyTitle: "የቅርብ ጊዜ የማስወገጃ እንቅስቃሴ",
    historyDescription:
      "የቅርብ ጊዜ ማስወገጃዎችን እና ወደ አቅራቢ መመለሻዎችን ከሙሉ ተጠያቂነት ጋር ይከታተሉ።",
    damagedShort: "ጉዳት",
    emptyHistoryTitle: "ገና የማስወገጃ ታሪክ የለም",
    emptyHistoryDescription:
      "የተመዘገቡ ጉዳት፣ የማብቂያ ማስወገጃ እና ወደ አቅራቢ መመለሻ እዚህ ይታያሉ።",
    remainingLabel: "የቀረ",
    reasonDamage: "የተበላሸ እቃ",
    reasonExpired: "ያለፈ እቃ",
    reasonReturnToSupplier: "ወደ አቅራቢ መመለስ",
    selectBatchBeforeSave: "ማስወገጃ ከመቀመጥዎ በፊት ባች ይምረጡ።",
    quantityMustBeWholeNumber: "ከዜሮ በላይ ሙሉ ቁጥር ያስገቡ።",
    quantityExceedsStock: "በዚህ ባች ውስጥ {count} ዩኒቶች ብቻ አሉ።",
    batchCannotBeReturned:
      "ይህ ባች የአቅራቢ መረጃ ስለሌለው ወደ አቅራቢ ሊመለስ አይችልም።",
    disposalSavedMessage:
      "{count} ዩኒቶች ከ {medicine} ባች {batch} ተወግደዋል።",
    notAvailable: "የለም",
  },
  om: {
    loadingWorkspace: "Bakki hojii deebii fi balleessuu ni fe'amaa jira…",
    defaultBranch: "Damee Guddaa",
    title: "Deebii fi Balleessuu",
    subtitle:
      "Kuusaa miidhame yookaan yeroo isaa darbe haala nageenya qabuun baasaa, baachota dhiyeessaa qabanis gara dhiyeessaa deebisaa {branch}.",
    searchPlaceholder: "Qoricha, baachii, yookaan dhiyeessaa barbaadi…",
    kpiEligibleBatches: "Baachota Filataman",
    kpiExpiredBatches: "Baachota Yeroon Dabre",
    kpiReturnableBatches: "Baachota Deebifamuu Danda'an",
    kpiDisposals: "Balleessuu Galmeeffame",
    kpiRetailValueRemoved: "Gatii Gurgurtaa Hir'ate",
    unitsEligible: "yuunitoota filataman",
    expiredNeedImmediateAction: "Hatattamaan ilaalamuu yookaan balleeffamuu qabu",
    batchesWithSupplierTrace: "Baachota gara dhiyeessaa deebifamuu danda'an",
    unitsRemoved: "yuunitoota hir'atan",
    returnedToSuppliers: "gara dhiyeessaa deebi'an",
    catalogTitle: "Kaataalogii Balleessuu",
    catalogDescription:
      "Baachii jiru fili, balaa xumuraa ilaali, achiis gara hojii sirrii keessatti galchi.",
    expiryRisk: "balaa xumuraa",
    emptyCatalogTitle: "Baachiin hin jiru",
    emptyCatalogDescription:
      "Damee kana keessatti kuusaan deebii yookaan balleessuu barbaadu amma hin jiru.",
    batchLabel: "Baachii",
    expiryLabel: "Guyyaa Xumuraa",
    receivedLabel: "Guyyaa Galfame",
    supplierLabel: "Dhiyeessaa",
    units: "yuunitii",
    statusExpired: "Yeroon Dabre",
    statusExpiringSoon: "Dhihoo keessatti ni xumurama",
    statusReturnable: "Deebifamuu danda'a",
    statusEligible: "Qophaa'e",
    formTitle: "Balleessuu Galmeessi",
    formDescription:
      "Baasuun kamiyyuu sirreeffama kuusaa, sochii kuusaa, fi galmee oditii uuma.",
    unitsOnHandLabel: "Yuunitoota jiran",
    quantityField: "Baay'ina",
    reasonField: "Sababa",
    notesField: "Yaadannoo",
    notesPlaceholder: "Ibsa dabalataa miidhaa, xumura, yookaan deebii dhiyeessaaaf.",
    submitButton: "Balleessuu Galchi",
    submittingButton: "Balleessuu ni galmaa'aa jira…",
    returnUnavailableNote:
      "Baachiin kun ragaa dhiyeessaa hin qabu, kanaaf gara dhiyeessaatti deebifamuu hin danda'u.",
    noBatchSelectedTitle: "Baachii fili",
    noBatchSelectedDescription:
      "Miidhaa, xumura, yookaan gara dhiyeessaa deebii galmeessuuf kaataalogii keessaa baachii fili.",
    historyTitle: "Sochii Balleessuu Dhihoo",
    historyDescription:
      "Balleessuu fi deebii dhiyeessaa dhihoo itti gaafatamummaa guutuun hordofi.",
    damagedShort: "miidhaa",
    emptyHistoryTitle: "Seenaa balleessuu hin jiru",
    emptyHistoryDescription:
      "Miidhaan, baafamuun sababii xumuraa, fi deebiin dhiyeessaa asitti mul'atu.",
    remainingLabel: "Hafe",
    reasonDamage: "Kuusaa miidhame",
    reasonExpired: "Kuusaa yeroon darbe",
    reasonReturnToSupplier: "Gara dhiyeessaa deebisi",
    selectBatchBeforeSave: "Balleessuu galchuun dura baachii fili.",
    quantityMustBeWholeNumber:
      "Lakkoofsa guutuu zeeroo caalu galchi.",
    quantityExceedsStock: "Baachii kana keessatti yuunitoonni {count} qofa jiru.",
    batchCannotBeReturned:
      "Baachiin kun ragaa dhiyeessaa waan hin qabneef gara dhiyeessaatti deebifamuu hin danda'u.",
    disposalSavedMessage:
      "Yuunitoonni {count} qoricha {medicine} baachii {batch} irraa hir'atan.",
    notAvailable: "Hin jiru",
  },
};
