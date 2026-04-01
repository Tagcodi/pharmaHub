"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import { useI18n } from "../i18n/I18nProvider";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from "../i18n/format";
import {
  TOKEN_KEY,
  type DispensePrescriptionResponse,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type PaymentMethodValue,
  type PrescriptionCatalogResponse,
  type PrescriptionRecord,
  type PrescriptionStatus,
  type PrescriptionsQueueResponse,
  type SessionResponse,
} from "../lib/api";

type DraftItem = {
  medicineId: string;
  medicineName: string;
  quantity: number;
  instructions: string;
  unit: string | null;
  stock: number;
};

type PrescriptionStockReadinessLine =
  PrescriptionRecord["stockReadiness"]["lines"][number];

export default function PrescriptionsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = PRESCRIPTIONS_COPY[locale] as (typeof PRESCRIPTIONS_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<PrescriptionCatalogResponse | null>(null);
  const [queue, setQueue] = useState<PrescriptionsQueueResponse | null>(null);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [search, setSearch] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [prescriberName, setPrescriberName] = useState("");
  const [promisedAt, setPromisedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [statusUpdate, setStatusUpdate] = useState<PrescriptionStatus>("RECEIVED");
  const [statusNotes, setStatusNotes] = useState("");
  const [dispensePaymentMethod, setDispensePaymentMethod] =
    useState<PaymentMethodValue>("CASH");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDispensing, setIsDispensing] = useState(false);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!queue?.prescriptions.length) {
      setSelectedPrescriptionId("");
      return;
    }

    if (!selectedPrescriptionId) {
      setSelectedPrescriptionId(queue.prescriptions[0]?.id ?? "");
      return;
    }

    const stillExists = queue.prescriptions.some(
      (prescription) => prescription.id === selectedPrescriptionId
    );

    if (!stillExists) {
      setSelectedPrescriptionId(queue.prescriptions[0]?.id ?? "");
    }
  }, [queue, selectedPrescriptionId]);

  const selectedPrescription =
    queue?.prescriptions.find((prescription) => prescription.id === selectedPrescriptionId) ??
    null;
  const statusOptions = getStatusOptions(text, selectedPrescription?.status);
  const isStatusLocked =
    selectedPrescription?.status === "DISPENSED" ||
    selectedPrescription?.status === "CANCELLED";
  const selectedStockReadiness = selectedPrescription?.stockReadiness ?? null;
  const selectedStockIssues =
    selectedStockReadiness?.lines.filter((line) => line.issueCode !== null) ?? [];
  const selectedStockLineByItemId = new Map(
    (selectedStockReadiness?.lines ?? []).map((line) => [line.prescriptionItemId, line])
  );
  const isDispenseBlockedByStock =
    Boolean(selectedPrescription) &&
    selectedPrescription?.status === "READY" &&
    !selectedPrescription?.sale &&
    !(selectedStockReadiness?.canDispense ?? false);

  useEffect(() => {
    if (!selectedPrescription) {
      return;
    }

    setStatusUpdate(selectedPrescription.status);
    setStatusNotes(selectedPrescription.notes ?? "");
  }, [selectedPrescription]);

  useEffect(() => {
    if (selectedPrescription?.sale) {
      setDispensePaymentMethod(selectedPrescription.sale.paymentMethod);
      return;
    }

    setDispensePaymentMethod("CASH");
  }, [selectedPrescription]);

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

      const [catalogData, queueData] = await Promise.all([
        fetchJson<PrescriptionCatalogResponse>("/prescriptions/catalog", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<PrescriptionsQueueResponse>("/prescriptions", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setSession(sessionData);
      setCatalog(catalogData);
      setQueue(queueData);
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

    const [catalogData, queueData] = await Promise.all([
      fetchJson<PrescriptionCatalogResponse>("/prescriptions/catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<PrescriptionsQueueResponse>("/prescriptions", {
        headers: getAuthHeaders(token),
      }),
    ]);

    setCatalog(catalogData);
    setQueue(queueData);
  }

  const filteredQueue = useMemo(() => {
    const prescriptions = queue?.prescriptions ?? [];
    const query = search.trim().toLowerCase();

    return prescriptions.filter((prescription) => {
      if (!query) {
        return true;
      }

      return (
        prescription.prescriptionNumber.toLowerCase().includes(query) ||
        prescription.patientName.toLowerCase().includes(query) ||
        (prescription.prescriberName ?? "").toLowerCase().includes(query) ||
        prescription.items.some((item) =>
          item.medicineName.toLowerCase().includes(query)
        )
      );
    });
  }, [queue?.prescriptions, search]);

  async function handleAddDraftItem() {
    const medicine = catalog?.medicines.find((item) => item.id === selectedMedicineId);
    const parsedQuantity = Number(draftQuantity);

    if (!medicine) {
      setError(text.chooseMedicineError);
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setError(text.invalidQuantityError);
      return;
    }

    if (draftItems.some((item) => item.medicineId === medicine.id)) {
      setError(text.duplicateMedicineError.replace("{medicine}", medicine.name));
      return;
    }

    setDraftItems((current) => [
      ...current,
      {
        medicineId: medicine.id,
        medicineName: medicine.name,
        quantity: parsedQuantity,
        instructions: draftInstructions.trim(),
        unit: medicine.unit,
        stock: medicine.totalQuantityOnHand,
      },
    ]);
    setSelectedMedicineId("");
    setDraftQuantity("1");
    setDraftInstructions("");
    setError(null);
  }

  async function handleCreatePrescription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!patientName.trim()) {
      setError(text.patientNameRequired);
      return;
    }

    if (draftItems.length === 0) {
      setError(text.addAtLeastOneLineError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await fetchJson<PrescriptionRecord>("/prescriptions", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim() || undefined,
          prescriberName: prescriberName.trim() || undefined,
          promisedAt: promisedAt || undefined,
          notes: notes.trim() || undefined,
          items: draftItems.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            instructions: item.instructions || undefined,
          })),
        }),
      });

      setSuccessMessage(
        text.prescriptionCreatedMessage
          .replace("{number}", created.prescriptionNumber)
          .replace("{patient}", created.patientName)
      );
      setPatientName("");
      setPatientPhone("");
      setPrescriberName("");
      setPromisedAt("");
      setNotes("");
      setDraftItems([]);
      setSelectedPrescriptionId(created.id);

      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateStatus() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!selectedPrescription) {
      setError(text.selectPrescriptionError);
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await fetchJson<PrescriptionRecord>(
        `/prescriptions/${selectedPrescription.id}/status`,
        {
          method: "PATCH",
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            status: statusUpdate,
            notes: statusNotes.trim() || undefined,
          }),
        }
      );

      setSuccessMessage(
        text.statusUpdatedMessage
          .replace("{number}", updated.prescriptionNumber)
          .replace("{status}", getStatusLabel(updated.status, text))
      );
      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDispensePrescription() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!selectedPrescription) {
      setError(text.selectPrescriptionError);
      return;
    }

    if (!selectedPrescription.stockReadiness.canDispense) {
      setError(text.dispenseBlockedError);
      return;
    }

    setIsDispensing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<DispensePrescriptionResponse>(
        `/prescriptions/${selectedPrescription.id}/dispense`,
        {
          method: "POST",
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            paymentMethod: dispensePaymentMethod,
          }),
        }
      );

      setSuccessMessage(
        text.prescriptionDispensedMessage
          .replace("{number}", result.prescription.prescriptionNumber)
          .replace("{saleNumber}", result.sale.saleNumber)
      );
      await refreshData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsDispensing(false);
    }
  }

  if (isLoading) {
    return <AppLoading message={text.loadingWorkspace} />;
  }

  if (!session) {
    return null;
  }

  const queueMetrics = queue?.metrics ?? {
    totalPrescriptions: 0,
    activeQueueCount: 0,
    receivedCount: 0,
    inReviewCount: 0,
    readyCount: 0,
    dispensedTodayCount: 0,
  };

  const catalogMetrics = catalog?.metrics ?? {
    totalMedicines: 0,
    stockedMedicines: 0,
    lowStockCount: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label={text.kpiActiveQueue}
            value={formatNumber(queueMetrics.activeQueueCount, locale)}
            note={`${formatNumber(queueMetrics.totalPrescriptions, locale)} ${text.totalLogged}`}
          />
          <KpiCard
            label={text.kpiReceived}
            value={formatNumber(queueMetrics.receivedCount, locale)}
            note={text.waitingForReview}
          />
          <KpiCard
            label={text.kpiInReview}
            value={formatNumber(queueMetrics.inReviewCount, locale)}
            valueColor="#6e3900"
            note={text.beingChecked}
          />
          <KpiCard
            label={text.kpiReady}
            value={formatNumber(queueMetrics.readyCount, locale)}
            valueColor="#004253"
            note={text.readyForDispense}
          />
          <KpiCard
            label={text.kpiDispensedToday}
            value={formatNumber(queueMetrics.dispensedTodayCount, locale)}
            note={`${formatNumber(catalogMetrics.stockedMedicines, locale)} ${text.catalogInStock}`}
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

        <div className="grid gap-6 xl:grid-cols-[1.05fr_420px]">
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
                    queue?.branch.name ?? session.branch?.name ?? text.defaultBranch
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
                    {text.queueTitle}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {text.queueDescription}
                  </p>
                </div>
                <StatusBadge
                  label={`${formatNumber(catalogMetrics.lowStockCount, locale)} ${text.lowStockMedicines}`}
                  tone="warning"
                />
              </div>

              {filteredQueue.length === 0 ? (
                <EmptyStateCard
                  compact
                  title={text.emptyQueueTitle}
                  description={text.emptyQueueDescription}
                />
              ) : (
                <div className="space-y-3">
                  {filteredQueue.map((prescription) => {
                    const active = prescription.id === selectedPrescriptionId;

                    return (
                      <button
                        key={prescription.id}
                        type="button"
                        onClick={() => setSelectedPrescriptionId(prescription.id)}
                        className={[
                          "w-full rounded-xl border px-4 py-4 text-left transition-all",
                          active
                            ? "border-primary bg-primary/[0.05]"
                            : "border-outline/10 bg-surface hover:border-primary/20 hover:bg-primary/[0.02]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-on-surface">
                                {prescription.prescriptionNumber}
                              </p>
                              <StatusBadge
                                label={getStatusLabel(prescription.status, text)}
                                tone={getStatusTone(prescription.status)}
                              />
                              {prescription.status === "READY" &&
                              !prescription.sale &&
                              !prescription.stockReadiness.canDispense ? (
                                <StatusBadge
                                  label={text.stockBlockedBadge}
                                  tone="warning"
                                />
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-on-surface">
                              {prescription.patientName}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {prescription.prescriberName ?? text.noPrescriber}
                            </p>
                          </div>

                          <div className="text-right text-xs text-on-surface-variant">
                            <p>{formatRelativeTime(prescription.receivedAt, locale)}</p>
                            <p className="mt-1">
                              {formatNumber(prescription.totalRequestedUnits, locale)} {text.units}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {prescription.items.map((item) => (
                            <StatusBadge
                              key={item.id}
                              label={`${item.medicineName} × ${formatNumber(item.quantity, locale)}`}
                              tone="neutral"
                            />
                          ))}
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
                <h2 className="text-lg font-semibold text-on-surface">{text.intakeTitle}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.intakeDescription}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreatePrescription}>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                    {text.patientNameField}
                  </span>
                  <input
                    value={patientName}
                    onChange={(event) => setPatientName(event.target.value)}
                    className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={text.patientNamePlaceholder}
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                      {text.patientPhoneField}
                    </span>
                    <input
                      value={patientPhone}
                      onChange={(event) => setPatientPhone(event.target.value)}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder={text.patientPhonePlaceholder}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                      {text.prescriberField}
                    </span>
                    <input
                      value={prescriberName}
                      onChange={(event) => setPrescriberName(event.target.value)}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder={text.prescriberPlaceholder}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                    {text.promisedAtField}
                  </span>
                  <input
                    type="datetime-local"
                    value={promisedAt}
                    onChange={(event) => setPromisedAt(event.target.value)}
                    className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <div className="rounded-xl bg-surface p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-on-surface">{text.medicineLinesTitle}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {text.medicineLinesDescription}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <select
                      value={selectedMedicineId}
                      onChange={(event) => setSelectedMedicineId(event.target.value)}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">{text.selectMedicinePlaceholder}</option>
                      {(catalog?.medicines ?? []).map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>
                          {medicine.name} ({formatNumber(medicine.totalQuantityOnHand, locale)} {medicine.unit ?? text.units})
                        </option>
                      ))}
                    </select>

                    <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                      <input
                        type="number"
                        min={1}
                        value={draftQuantity}
                        onChange={(event) => setDraftQuantity(event.target.value)}
                        className="h-11 rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.quantityField}
                      />
                      <input
                        value={draftInstructions}
                        onChange={(event) => setDraftInstructions(event.target.value)}
                        className="h-11 rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.instructionsPlaceholder}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddDraftItem}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-outline/10 bg-surface-low px-4 text-sm font-semibold text-on-surface transition-colors hover:bg-surface"
                    >
                      {text.addLineButton}
                    </button>
                  </div>

                  {draftItems.length ? (
                    <div className="mt-4 space-y-2">
                      {draftItems.map((item) => (
                        <div
                          key={item.medicineId}
                          className="flex items-center justify-between gap-3 rounded-lg border border-outline/10 bg-surface-low px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-on-surface">
                              {item.medicineName}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {formatNumber(item.quantity, locale)} {item.unit ?? text.units}
                              {item.instructions ? ` • ${item.instructions}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftItems((current) =>
                                current.filter((draft) => draft.medicineId !== item.medicineId)
                              )
                            }
                            className="text-xs font-semibold text-error"
                          >
                            {text.removeButton}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                    {text.notesField}
                  </span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-outline/10 bg-surface px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={text.notesPlaceholder}
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                >
                  {isSubmitting ? text.creatingButton : text.createButton}
                </button>
              </form>
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-on-surface">{text.detailTitle}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.detailDescription}
                </p>
              </div>

              {selectedPrescription ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {selectedPrescription.prescriptionNumber}
                        </p>
                        <p className="mt-1 text-sm text-on-surface">
                          {selectedPrescription.patientName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {selectedPrescription.prescriberName ?? text.noPrescriber}
                        </p>
                      </div>
                      <StatusBadge
                        label={getStatusLabel(selectedPrescription.status, text)}
                        tone={getStatusTone(selectedPrescription.status)}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-on-surface-variant">
                      <p>
                        <span className="font-semibold text-on-surface">{text.receivedLabel}</span>{" "}
                        {formatDateTime(selectedPrescription.receivedAt, locale)}
                      </p>
                      {selectedPrescription.promisedAt ? (
                        <p>
                          <span className="font-semibold text-on-surface">{text.promisedLabel}</span>{" "}
                          {formatDateTime(selectedPrescription.promisedAt, locale)}
                        </p>
                      ) : null}
                      {selectedPrescription.dispensedAt ? (
                        <p>
                          <span className="font-semibold text-on-surface">{text.dispensedLabel}</span>{" "}
                          {formatDateTime(selectedPrescription.dispensedAt, locale)}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2">
                      {selectedPrescription.items.map((item) => {
                        const stockLine = selectedStockLineByItemId.get(item.id);

                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-outline/10 bg-surface-low px-3 py-2"
                          >
                            <p className="text-sm font-medium text-on-surface">
                              {item.medicineName}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {formatNumber(item.quantity, locale)} {item.medicine?.unit ?? text.units}
                              {item.instructions ? ` • ${item.instructions}` : ""}
                            </p>
                            {stockLine ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <StatusBadge
                                  label={getStockLineLabel(stockLine, text)}
                                  tone={getStockLineTone(stockLine)}
                                />
                                <p className="text-xs text-on-surface-variant">
                                  {text.stockAvailabilityLabel
                                    .replace(
                                      "{available}",
                                      formatNumber(stockLine.availableQuantity, locale)
                                    )
                                    .replace(
                                      "{requested}",
                                      formatNumber(stockLine.requestedQuantity, locale)
                                    )}
                                </p>
                                {stockLine.shortageQuantity > 0 ? (
                                  <p className="text-xs font-semibold text-error">
                                    {text.stockShortageLabel.replace(
                                      "{shortage}",
                                      formatNumber(stockLine.shortageQuantity, locale)
                                    )}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {selectedPrescription.sale ? (
                      <div className="mt-4 rounded-lg border border-outline/10 bg-surface-low px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-on-surface">
                              {text.linkedSaleTitle}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {selectedPrescription.sale.saleNumber}
                            </p>
                          </div>
                          <StatusBadge
                            label={formatPaymentMethod(
                              selectedPrescription.sale.paymentMethod,
                              text
                            )}
                            tone="info"
                          />
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-on-surface-variant">
                          <p>
                            <span className="font-semibold text-on-surface">
                              {text.saleAmountLabel}
                            </span>{" "}
                            ETB {formatNumber(selectedPrescription.sale.totalAmount, locale)}
                          </p>
                          <p>
                            <span className="font-semibold text-on-surface">
                              {text.saleRecordedLabel}
                            </span>{" "}
                            {formatDateTime(selectedPrescription.sale.soldAt, locale)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {text.statusField}
                      </span>
                      <select
                        value={statusUpdate}
                        onChange={(event) =>
                          setStatusUpdate(event.target.value as PrescriptionStatus)
                        }
                        disabled={isStatusLocked}
                        className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {text.statusNotesField}
                      </span>
                      <textarea
                        value={statusNotes}
                        onChange={(event) => setStatusNotes(event.target.value)}
                        rows={3}
                        disabled={isStatusLocked}
                        className="w-full rounded-lg border border-outline/10 bg-surface px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.statusNotesPlaceholder}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleUpdateStatus}
                      disabled={isUpdating || isStatusLocked}
                      className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-outline/10 bg-surface-low text-sm font-bold text-on-surface disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isUpdating ? text.updatingButton : text.updateStatusButton}
                    </button>
                  </div>

                  {selectedPrescription.status === "READY" && !selectedPrescription.sale ? (
                    <div className="rounded-xl border border-primary/10 bg-primary/[0.04] p-4">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-on-surface">
                          {text.dispenseTitle}
                        </h3>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {text.dispenseDescription}
                        </p>
                      </div>

                      <div className="mb-4 rounded-lg border border-outline/10 bg-surface px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={
                              selectedStockReadiness?.canDispense
                                ? text.stockStatusReady
                                : text.stockStatusBlocked
                            }
                            tone={
                              selectedStockReadiness?.canDispense ? "success" : "warning"
                            }
                          />
                          <p className="text-xs text-on-surface-variant">
                            {selectedStockReadiness?.canDispense
                              ? text.stockReadinessReadyMessage
                              : text.stockReadinessBlockedMessage.replace(
                                  "{count}",
                                  formatNumber(
                                    selectedStockReadiness?.issueCount ?? 0,
                                    locale
                                  )
                                )}
                          </p>
                        </div>

                        {selectedStockIssues.length ? (
                          <div className="mt-3 space-y-2">
                            {selectedStockIssues.map((issue) => (
                              <p
                                key={issue.prescriptionItemId}
                                className="text-xs text-on-surface-variant"
                              >
                                <span className="font-semibold text-on-surface">
                                  {issue.medicineName}
                                </span>{" "}
                                {text.stockIssueDetail
                                  .replace(
                                    "{issue}",
                                    formatStockIssue(issue.issueCode!, text)
                                  )
                                  .replace(
                                    "{requested}",
                                    formatNumber(issue.requestedQuantity, locale)
                                  )
                                  .replace(
                                    "{available}",
                                    formatNumber(issue.availableQuantity, locale)
                                  )
                                  .replace(
                                    "{shortage}",
                                    formatNumber(issue.shortageQuantity, locale)
                                  )}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                          {text.paymentMethodField}
                        </span>
                        <select
                          value={dispensePaymentMethod}
                          onChange={(event) =>
                            setDispensePaymentMethod(
                              event.target.value as PaymentMethodValue
                            )
                          }
                          className="h-11 w-full rounded-lg border border-outline/10 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {formatPaymentMethod(option.value, text)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={handleDispensePrescription}
                        disabled={isDispensing || isDispenseBlockedByStock}
                        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                      >
                        {isDispensing ? text.dispensingButton : text.dispenseButton}
                      </button>
                      {isDispenseBlockedByStock ? (
                        <p className="mt-2 text-xs font-semibold text-error">
                          {text.dispenseBlockedMessage}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noSelectionTitle}
                  description={text.noSelectionDescription}
                />
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getStatusOptions(
  text: (typeof PRESCRIPTIONS_COPY)["en"],
  currentStatus?: PrescriptionStatus
) {
  const options = [
    { value: "RECEIVED" as const, label: text.statusReceived },
    { value: "IN_REVIEW" as const, label: text.statusInReview },
    { value: "READY" as const, label: text.statusReady },
    { value: "CANCELLED" as const, label: text.statusCancelled },
  ];

  if (currentStatus === "DISPENSED") {
    return [...options, { value: "DISPENSED" as const, label: text.statusDispensed }];
  }

  return options;
}

function getStatusLabel(
  status: PrescriptionStatus,
  text: (typeof PRESCRIPTIONS_COPY)["en"]
) {
  if (status === "IN_REVIEW") {
    return text.statusInReview;
  }

  if (status === "READY") {
    return text.statusReady;
  }

  if (status === "DISPENSED") {
    return text.statusDispensed;
  }

  if (status === "CANCELLED") {
    return text.statusCancelled;
  }

  return text.statusReceived;
}

function getStatusTone(status: PrescriptionStatus) {
  if (status === "READY") {
    return "success" as const;
  }

  if (status === "DISPENSED") {
    return "info" as const;
  }

  if (status === "CANCELLED") {
    return "warning" as const;
  }

  if (status === "IN_REVIEW") {
    return "warning" as const;
  }

  return "neutral" as const;
}

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethodValue }> = [
  { value: "CASH" },
  { value: "CARD" },
  { value: "MOBILE_MONEY" },
  { value: "BANK_TRANSFER" },
];

function formatPaymentMethod(
  method: PaymentMethodValue,
  text: (typeof PRESCRIPTIONS_COPY)["en"]
) {
  if (method === "CARD") {
    return text.paymentMethodCard;
  }

  if (method === "MOBILE_MONEY") {
    return text.paymentMethodMobileMoney;
  }

  if (method === "BANK_TRANSFER") {
    return text.paymentMethodBankTransfer;
  }

  return text.paymentMethodCash;
}

function getStockLineTone(line: PrescriptionStockReadinessLine) {
  return line.issueCode ? ("warning" as const) : ("success" as const);
}

function getStockLineLabel(
  line: PrescriptionStockReadinessLine,
  text: (typeof PRESCRIPTIONS_COPY)["en"]
) {
  if (line.issueCode === "MISSING_MEDICINE") {
    return text.stockIssueMissing;
  }

  if (line.issueCode === "INSUFFICIENT_STOCK") {
    return text.stockIssueInsufficient;
  }

  return text.stockIssueReady;
}

function formatStockIssue(
  issueCode: Exclude<PrescriptionStockReadinessLine["issueCode"], null>,
  text: (typeof PRESCRIPTIONS_COPY)["en"]
) {
  if (issueCode === "MISSING_MEDICINE") {
    return text.stockIssueMissing;
  }

  return text.stockIssueInsufficient;
}

const PRESCRIPTIONS_COPY = {
  en: {
    loadingWorkspace: "Loading prescription queue…",
    defaultBranch: "Main Branch",
    title: "Prescription Queue",
    subtitle:
      "Track intake, review, and dispense readiness for live prescriptions in {branch}.",
    kpiActiveQueue: "Active Queue",
    kpiReceived: "Received",
    kpiInReview: "In Review",
    kpiReady: "Ready",
    kpiDispensedToday: "Dispensed Today",
    totalLogged: "total logged",
    waitingForReview: "Waiting for pharmacist review",
    beingChecked: "Being checked against stock",
    readyForDispense: "Ready at the counter",
    catalogInStock: "catalog medicines in stock",
    searchPlaceholder: "Search patient, prescription, or medicine…",
    queueTitle: "Prescription List",
    queueDescription:
      "Select a prescription to review its items, notes, and current workflow stage.",
    lowStockMedicines: "low-stock medicines",
    emptyQueueTitle: "No prescriptions yet",
    emptyQueueDescription:
      "New prescriptions will appear here once staff log the first intake.",
    noPrescriber: "No prescriber recorded",
    units: "units",
    intakeTitle: "New Intake",
    intakeDescription:
      "Capture a prescription with patient details and medicine line items from the live catalog.",
    patientNameField: "Patient Name",
    patientNamePlaceholder: "Selamawit Bekele",
    patientPhoneField: "Patient Phone",
    patientPhonePlaceholder: "+251 9xx xxx xxx",
    prescriberField: "Prescriber",
    prescriberPlaceholder: "Dr. Meron Alemu",
    promisedAtField: "Promised Pick-up Time",
    medicineLinesTitle: "Medicine Lines",
    medicineLinesDescription:
      "Add requested medicines and directions before creating the queue entry.",
    selectMedicinePlaceholder: "Select a medicine from the live catalog",
    quantityField: "Quantity",
    instructionsPlaceholder: "e.g. 1 tablet twice daily",
    addLineButton: "Add Line",
    removeButton: "Remove",
    notesField: "Notes",
    notesPlaceholder: "Optional intake notes, substitutions, or cautions.",
    createButton: "Create Prescription",
    creatingButton: "Creating prescription…",
    detailTitle: "Selected Prescription",
    detailDescription:
      "Review the current prescription and move it through the dispensing workflow.",
    linkedSaleTitle: "Linked Sale",
    receivedLabel: "Received",
    promisedLabel: "Promised",
    dispensedLabel: "Dispensed",
    saleAmountLabel: "Sale Amount",
    saleRecordedLabel: "Sale Recorded",
    statusField: "Status",
    statusNotesField: "Queue Notes",
    statusNotesPlaceholder: "Optional notes about preparation or patient follow-up.",
    updateStatusButton: "Update Status",
    updatingButton: "Updating status…",
    dispenseTitle: "Dispense To POS",
    dispenseDescription:
      "Create the live sale from this ready prescription and deduct stock automatically.",
    paymentMethodField: "Payment Method",
    paymentMethodCash: "Cash",
    paymentMethodCard: "Card",
    paymentMethodMobileMoney: "Mobile Money",
    paymentMethodBankTransfer: "Bank Transfer",
    stockBlockedBadge: "Stock issue",
    stockIssueReady: "Stock ready",
    stockIssueMissing: "Medicine missing",
    stockIssueInsufficient: "Insufficient stock",
    stockAvailabilityLabel: "Available {available} / Requested {requested}",
    stockShortageLabel: "Short {shortage}",
    stockStatusReady: "Ready to dispense",
    stockStatusBlocked: "Resolve stock issues",
    stockReadinessReadyMessage:
      "All prescription lines have enough live stock for dispensing.",
    stockReadinessBlockedMessage:
      "{count} stock issue(s) must be resolved before dispensing.",
    stockIssueDetail:
      "{issue}: requested {requested}, available {available}, short {shortage}.",
    dispenseButton: "Dispense Prescription",
    dispensingButton: "Dispensing prescription…",
    dispenseBlockedMessage:
      "Dispensing is disabled until stock issues are resolved.",
    noSelectionTitle: "Select a prescription",
    noSelectionDescription:
      "Choose a prescription from the queue to review details and update its status.",
    statusReceived: "Received",
    statusInReview: "In Review",
    statusReady: "Ready",
    statusDispensed: "Dispensed",
    statusCancelled: "Cancelled",
    chooseMedicineError: "Choose a medicine before adding a prescription line.",
    invalidQuantityError: "Enter a whole-number quantity greater than zero.",
    duplicateMedicineError: "{medicine} is already added to this prescription.",
    patientNameRequired: "Patient name is required before creating a prescription.",
    addAtLeastOneLineError: "Add at least one medicine line before creating a prescription.",
    selectPrescriptionError: "Select a prescription before updating its status.",
    dispenseBlockedError:
      "Stock issues must be resolved before dispensing this prescription.",
    prescriptionCreatedMessage:
      "Prescription {number} created for {patient}.",
    statusUpdatedMessage:
      "Prescription {number} moved to {status}.",
    prescriptionDispensedMessage:
      "Prescription {number} was dispensed as sale {saleNumber}.",
  },
  am: {
    loadingWorkspace: "የሀኪም ትዕዛዝ ወረፋ በመጫን ላይ…",
    defaultBranch: "ዋና ቅርንጫፍ",
    title: "የሀኪም ትዕዛዝ ወረፋ",
    subtitle:
      "በ {branch} ውስጥ የሚገኙ የሀኪም ትዕዛዞችን ከመቀበል እስከ መዘጋጀት እና መስጠት ድረስ ይከታተሉ።",
    kpiActiveQueue: "ንቁ ወረፋ",
    kpiReceived: "የተቀበሉ",
    kpiInReview: "በግምገማ ላይ",
    kpiReady: "ዝግጁ",
    kpiDispensedToday: "ዛሬ የተሰጡ",
    totalLogged: "ጠቅላላ የተመዘገቡ",
    waitingForReview: "የፋርማሲስት ግምገማን እየጠበቁ",
    beingChecked: "ከእቃ ጋር በመመርመር ላይ",
    readyForDispense: "በመስጫ ዝግጁ",
    catalogInStock: "በካታሎግ ውስጥ ካሉ መድሃኒቶች",
    searchPlaceholder: "ታካሚ፣ ትዕዛዝ ወይም መድሃኒት ይፈልጉ…",
    queueTitle: "የትዕዛዝ ዝርዝር",
    queueDescription:
      "እቃዎችን፣ ማስታወሻዎችን እና የስራ ደረጃውን ለማየት ትዕዛዝ ይምረጡ።",
    lowStockMedicines: "ዝቅተኛ እቃ ያላቸው መድሃኒቶች",
    emptyQueueTitle: "ገና ምንም ትዕዛዝ የለም",
    emptyQueueDescription:
      "ሰራተኞች የመጀመሪያውን ትዕዛዝ ሲመዘግቡ እዚህ ይታያል።",
    noPrescriber: "ሀኪም አልተመዘገበም",
    units: "ዩኒቶች",
    intakeTitle: "አዲስ መቀበያ",
    intakeDescription:
      "የታካሚ መረጃና የመድሃኒት መስመሮችን ከቀጥታ ካታሎግ ጋር ይመዝግቡ።",
    patientNameField: "የታካሚ ስም",
    patientNamePlaceholder: "ሰላማዊት በቀለ",
    patientPhoneField: "የታካሚ ስልክ",
    patientPhonePlaceholder: "+251 9xx xxx xxx",
    prescriberField: "ሀኪም",
    prescriberPlaceholder: "ዶ/ር መሮን አለሙ",
    promisedAtField: "የመውሰድ የተገባ ጊዜ",
    medicineLinesTitle: "የመድሃኒት መስመሮች",
    medicineLinesDescription:
      "ትዕዛዙን ከመፍጠርዎ በፊት የተጠየቁ መድሃኒቶችን እና መመሪያዎችን ያክሉ።",
    selectMedicinePlaceholder: "ከቀጥታ ካታሎግ መድሃኒት ይምረጡ",
    quantityField: "ብዛት",
    instructionsPlaceholder: "ለምሳሌ 1 ታብሌት በቀን 2 ጊዜ",
    addLineButton: "መስመር አክል",
    removeButton: "አስወግድ",
    notesField: "ማስታወሻዎች",
    notesPlaceholder: "ተጨማሪ ማስታወሻ፣ ተቀያይሮች ወይም ጥንቃቄዎች።",
    createButton: "ትዕዛዝ ፍጠር",
    creatingButton: "ትዕዛዝ በመፍጠር ላይ…",
    detailTitle: "የተመረጠ ትዕዛዝ",
    detailDescription:
      "አሁን ያለውን ትዕዛዝ ይገምግሙ እና በየስራ ደረጃው ያንቀሳቅሱት።",
    linkedSaleTitle: "የተያያዘ ሽያጭ",
    receivedLabel: "የተቀበለበት",
    promisedLabel: "የተገባ ጊዜ",
    dispensedLabel: "የተሰጠበት",
    saleAmountLabel: "የሽያጭ መጠን",
    saleRecordedLabel: "ሽያጩ የተመዘገበበት",
    statusField: "ሁኔታ",
    statusNotesField: "የወረፋ ማስታወሻ",
    statusNotesPlaceholder: "ስለ ዝግጅት ወይም ስለ ታካሚ ክትትል ማስታወሻ።",
    updateStatusButton: "ሁኔታ አዘምን",
    updatingButton: "ሁኔታ በማዘመን ላይ…",
    dispenseTitle: "ወደ POS መስጠት",
    dispenseDescription:
      "ከዚህ ዝግጁ ትዕዛዝ ቀጥታ ሽያጭ ይፍጠሩ እና እቃውን በራስ-ሰር ያስቀንሱ።",
    paymentMethodField: "የክፍያ ዘዴ",
    paymentMethodCash: "ጥሬ ገንዘብ",
    paymentMethodCard: "ካርድ",
    paymentMethodMobileMoney: "ሞባይል ገንዘብ",
    paymentMethodBankTransfer: "የባንክ ዝውውር",
    stockBlockedBadge: "የእቃ ችግር",
    stockIssueReady: "እቃ ዝግጁ ነው",
    stockIssueMissing: "መድሃኒቱ አይገኝም",
    stockIssueInsufficient: "እቃ አይበቃም",
    stockAvailabilityLabel: "ያለው {available} / የተጠየቀው {requested}",
    stockShortageLabel: "የጎደለ {shortage}",
    stockStatusReady: "ለመስጠት ዝግጁ",
    stockStatusBlocked: "የእቃ ችግሮችን ፍቱ",
    stockReadinessReadyMessage:
      "ሁሉም የትዕዛዝ መስመሮች ለመስጠት በቂ ቀጥታ እቃ አላቸው።",
    stockReadinessBlockedMessage:
      "ከመስጠት በፊት {count} የእቃ ችግር መፍታት ያስፈልጋል።",
    stockIssueDetail:
      "{issue}: የተጠየቀ {requested}, ያለ {available}, የጎደለ {shortage}።",
    dispenseButton: "ትዕዛዙን ስጥ",
    dispensingButton: "ትዕዛዙን በመስጠት ላይ…",
    dispenseBlockedMessage:
      "የእቃ ችግሮች እስኪፈቱ ድረስ መስጠት ተዘግቷል።",
    noSelectionTitle: "ትዕዛዝ ይምረጡ",
    noSelectionDescription:
      "ዝርዝሮችን ለማየት እና ሁኔታውን ለማዘመን ከወረፋው ትዕዛዝ ይምረጡ።",
    statusReceived: "ተቀብሏል",
    statusInReview: "በግምገማ ላይ",
    statusReady: "ዝግጁ",
    statusDispensed: "ተሰጥቷል",
    statusCancelled: "ተሰርዟል",
    chooseMedicineError: "መስመር ከመጨመርዎ በፊት መድሃኒት ይምረጡ።",
    invalidQuantityError: "ከዜሮ በላይ ሙሉ ቁጥር ያስገቡ።",
    duplicateMedicineError: "{medicine} ቀድሞውኑ ተጨምሯል።",
    patientNameRequired: "ትዕዛዝ ከመፍጠርዎ በፊት የታካሚ ስም ያስፈልጋል።",
    addAtLeastOneLineError: "ትዕዛዝ ከመፍጠርዎ በፊት ቢያንስ አንድ መስመር ያክሉ።",
    selectPrescriptionError: "ሁኔታ ከማዘመንዎ በፊት ትዕዛዝ ይምረጡ።",
    dispenseBlockedError:
      "ይህን ትዕዛዝ ከመስጠት በፊት የእቃ ችግሮችን ይፍቱ።",
    prescriptionCreatedMessage:
      "ትዕዛዝ {number} ለ {patient} ተፈጥሯል።",
    statusUpdatedMessage:
      "ትዕዛዝ {number} ወደ {status} ተንቀሳቅሷል።",
    prescriptionDispensedMessage:
      "ትዕዛዝ {number} እንደ ሽያጭ {saleNumber} ተሰጥቷል።",
  },
  om: {
    loadingWorkspace: "Tarreen ajaja qorichaa ni fe'amaa jira…",
    defaultBranch: "Damee Guddaa",
    title: "Tarree Ajaja Qorichaa",
    subtitle:
      "Ajaja qorichaa jiraataa keessatti fudhachuu, qorachuu fi qophii kennuu hordofi {branch}.",
    kpiActiveQueue: "Tarree Hojii",
    kpiReceived: "Fudhatame",
    kpiInReview: "Qorannoorra",
    kpiReady: "Qophaa'e",
    kpiDispensedToday: "Har'a Kenname",
    totalLogged: "walumaagalatti galmaa'e",
    waitingForReview: "Qorannoo farmasistii eegaa jira",
    beingChecked: "Kuusaa waliin ni sakatta'amaa jira",
    readyForDispense: "Kaawuntara irratti qophaa'e",
    catalogInStock: "qorichoota kaataalogii keessaa jiran",
    searchPlaceholder: "Dhukkubsataa, ajaja, yookaan qoricha barbaadi…",
    queueTitle: "Tarree Ajajaa",
    queueDescription:
      "Wanti keessa jiru, yaadannoowwan, fi sadarkaa hojii isaa arguuf ajaja fili.",
    lowStockMedicines: "qorichoota kuusaan gadi aanaa",
    emptyQueueTitle: "Ajajni hin jiru",
    emptyQueueDescription:
      "Hojjettoonni ajaja jalqabaa yeroo galmeessan asitti mul'ata.",
    noPrescriber: "Ajajaan hin galmoofne",
    units: "yuunitii",
    intakeTitle: "Galmee Haaraa",
    intakeDescription:
      "Odeeffannoo dhukkubsataa fi sarara qorichaa kaataalogii jiraataa irraa galchi.",
    patientNameField: "Maqaa Dhukkubsataa",
    patientNamePlaceholder: "Selamawit Bekele",
    patientPhoneField: "Bilbila Dhukkubsataa",
    patientPhonePlaceholder: "+251 9xx xxx xxx",
    prescriberField: "Ajajaa",
    prescriberPlaceholder: "Dr. Meron Alemu",
    promisedAtField: "Yeroo Fudhachuu Beekame",
    medicineLinesTitle: "Sarara Qorichaa",
    medicineLinesDescription:
      "Ajaja uumuu dura qorichoota gaafataman fi qajeelfamoota isaanii dabali.",
    selectMedicinePlaceholder: "Kaataalogii jiraataa keessaa qoricha fili",
    quantityField: "Baay'ina",
    instructionsPlaceholder: "fkn. kiniinii 1 guyyaatti yeroo 2",
    addLineButton: "Sarara Dabali",
    removeButton: "Haqi",
    notesField: "Yaadannoo",
    notesPlaceholder: "Yaadannoo dabalataa, jijjiirraa, yookaan akeekkachiisa.",
    createButton: "Ajaja Uumi",
    creatingButton: "Ajajni ni uumamaa jira…",
    detailTitle: "Ajaja Filatame",
    detailDescription:
      "Ajaja amma jiru ilaali, achiis gara sadarkaa kenniinsaatti dabarsi.",
    linkedSaleTitle: "Gurgurtaa Walqabate",
    receivedLabel: "Fudhatame",
    promisedLabel: "Beekame",
    dispensedLabel: "Kenname",
    saleAmountLabel: "Hanga Gurgurtaa",
    saleRecordedLabel: "Yeroo Gurgurtaan Galmaa'e",
    statusField: "Haala",
    statusNotesField: "Yaadannoo Tarree",
    statusNotesPlaceholder: "Qophiidhaaf yookaan hordoffii dhukkubsataa yaadannoo dabalataa.",
    updateStatusButton: "Haala Haaromsi",
    updatingButton: "Haalli ni haaromfamaa jira…",
    dispenseTitle: "Gara POS Kenni",
    dispenseDescription:
      "Ajaja qophaa'e kana irraa gurgurtaa dhugaa uumiitii kuusaa ofumaan hir'isi.",
    paymentMethodField: "Mala Kaffaltii",
    paymentMethodCash: "Maallaqa callaa",
    paymentMethodCard: "Kaardii",
    paymentMethodMobileMoney: "Mobile Money",
    paymentMethodBankTransfer: "Dabarsa Baankii",
    stockBlockedBadge: "Rakkoo kuusaa",
    stockIssueReady: "Kuusaan qophaa'eera",
    stockIssueMissing: "Qorichi hin jiru",
    stockIssueInsufficient: "Kuusaan hin ga'u",
    stockAvailabilityLabel: "Jiru {available} / Gaafatame {requested}",
    stockShortageLabel: "Hafte {shortage}",
    stockStatusReady: "Kenniinsaaf qophaa'e",
    stockStatusBlocked: "Rakkoo kuusaa furi",
    stockReadinessReadyMessage:
      "Sararonni ajaja hundaaf kuusaan jiraataan gahaan ni jira.",
    stockReadinessBlockedMessage:
      "Kennuu dura rakkoowwan kuusaa {count} furamuu qabu.",
    stockIssueDetail:
      "{issue}: gaafatame {requested}, jiru {available}, hafte {shortage}.",
    dispenseButton: "Ajaja Kenni",
    dispensingButton: "Ajajni kennamaa jira…",
    dispenseBlockedMessage:
      "Rakkoowwan kuusaa hanga furamanitti kennuun cufameera.",
    noSelectionTitle: "Ajaja fili",
    noSelectionDescription:
      "Bal'ina isaa ilaaluuf fi haala isaa haaromsuuf ajaja tarree keessaa fili.",
    statusReceived: "Fudhatame",
    statusInReview: "Qorannoorra",
    statusReady: "Qophaa'e",
    statusDispensed: "Kenname",
    statusCancelled: "Haqame",
    chooseMedicineError: "Sarara dabaluun dura qoricha fili.",
    invalidQuantityError: "Lakkoofsa guutuu zeeroo caalu galchi.",
    duplicateMedicineError: "{medicine} ajaja kana keessatti duraan dabalamteera.",
    patientNameRequired: "Ajaja uumuu dura maqaan dhukkubsataa barbaachisaadha.",
    addAtLeastOneLineError: "Ajaja uumuu dura yoo xiqqaate sarara tokko dabali.",
    selectPrescriptionError: "Haala haaromsuun dura ajaja fili.",
    dispenseBlockedError:
      "Ajaja kana kennuu dura rakkoowwan kuusaa furuun barbaachisaadha.",
    prescriptionCreatedMessage:
      "Ajajni {number} {patient}f uumameera.",
    statusUpdatedMessage:
      "Ajajni {number} gara {status}tti jijjiirameera.",
    prescriptionDispensedMessage:
      "Ajajni {number} akka gurgurtaa {saleNumber}tti kennameera.",
  },
};
