"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { AppLoading } from "../../components/ui/AppLoading";
import { useI18n } from "../../i18n/I18nProvider";
import { formatCurrency } from "../../i18n/format";
import {
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type MedicineCatalogRecord,
  type SessionResponse,
  type StockInResponse,
} from "../../lib/api";

const initialForm = {
  medicineMode: "existing",
  medicineId: "",
  name: "",
  genericName: "",
  brandName: "",
  form: "",
  strength: "",
  category: "",
  unit: "",
  sku: "",
  supplierName: "",
  batchNumber: "",
  receivedAt: getTodayInputValue(),
  expiryDate: "",
  quantity: "",
  costPrice: "",
  sellingPrice: "",
};

export default function StockAdjustPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = STOCK_IN_COPY[locale] as (typeof STOCK_IN_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<MedicineCatalogRecord[]>([]);
  const [requestedMedicineId, setRequestedMedicineId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setRequestedMedicineId(params.get("medicineId") ?? params.get("id"));
  }, []);

  useEffect(() => {
    if (catalog.length === 0) {
      setForm((current) => ({
        ...current,
        medicineMode: "new",
        medicineId: "",
      }));
      return;
    }

    if (!requestedMedicineId) {
      return;
    }

    const selected = catalog.find((medicine) => medicine.id === requestedMedicineId);

    if (!selected) {
      return;
    }

    setForm((current) => ({
      ...current,
      medicineMode: "existing",
      medicineId: selected.id,
    }));
  }, [catalog, requestedMedicineId]);

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

      const medicines = await fetchJson<MedicineCatalogRecord[]>("/medicines", {
        headers: getAuthHeaders(token),
      });

      setCatalog(medicines);
      if (medicines.length === 0) {
        setForm((current) => ({
          ...current,
          medicineMode: "new",
        }));
      }
    } catch (err) {
      const message = formatError(err);

      if (message.toLowerCase().includes("missing bearer token")) {
        window.localStorage.removeItem("pharmahub.accessToken");
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateField<Key extends keyof typeof initialForm>(
    key: Key,
    value: (typeof initialForm)[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const selectedMedicine =
    form.medicineId && form.medicineMode === "existing"
      ? catalog.find((medicine) => medicine.id === form.medicineId) ?? null
      : null;

  const quantity = Number(form.quantity) || 0;
  const costPrice = Number(form.costPrice) || 0;
  const sellingPrice = Number(form.sellingPrice) || 0;
  const totalCost = quantity * costPrice;
  const expectedRevenue = quantity * sellingPrice;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (form.medicineMode === "existing" && !form.medicineId) {
      setError(text.selectMedicineBeforeReceiving);
      return;
    }

    if (form.medicineMode === "new" && !form.name.trim()) {
      setError(text.medicineNameRequired);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload =
        form.medicineMode === "existing"
          ? {
              medicineId: form.medicineId,
              batchNumber: form.batchNumber,
              supplierName: form.supplierName || undefined,
              receivedAt: form.receivedAt,
              expiryDate: form.expiryDate,
              quantity: Number(form.quantity),
              costPrice: Number(form.costPrice),
              sellingPrice: Number(form.sellingPrice),
            }
          : {
              name: form.name,
              genericName: form.genericName || undefined,
              brandName: form.brandName || undefined,
              form: form.form || undefined,
              strength: form.strength || undefined,
              category: form.category || undefined,
              unit: form.unit || undefined,
              sku: form.sku || undefined,
              batchNumber: form.batchNumber,
              supplierName: form.supplierName || undefined,
              receivedAt: form.receivedAt,
              expiryDate: form.expiryDate,
              quantity: Number(form.quantity),
              costPrice: Number(form.costPrice),
              sellingPrice: Number(form.sellingPrice),
            };

      const result = await fetchJson<StockInResponse>("/inventory/stock-in", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify(payload),
      });

      setSuccessMsg(
        text.stockReceivedMessage
          .replace("{medicine}", result.medicine.name)
          .replace("{batch}", result.batch.batchNumber)
      );

      setTimeout(() => {
        setSuccessMsg(null);
        router.push("/medicines");
      }, 1800);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <AppLoading message={text.loadingStockIntake} />;
  }

  if (!session) {
    return null;
  }

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <nav className="mb-5 flex items-center gap-2 text-xs text-on-surface-variant">
          <Link href="/medicines" className="transition-colors hover:text-on-surface">
            {text.inventory}
          </Link>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M4 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-semibold text-on-surface">{text.receiveStock}</span>
        </nav>

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {text.receiveStock}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {text.receiveStockDescription.replace(
                "{branch}",
                session.branch?.name ?? text.defaultBranch
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/medicines"
              className="flex h-10 items-center rounded px-5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-high"
              style={{ border: "1px solid rgba(0,66,83,0.14)" }}
            >
              {text.cancel}
            </Link>
            <button
              form="stock-in-form"
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 cursor-pointer items-center gap-2 rounded px-5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
              >
                <path
                  d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                  strokeLinecap="round"
                />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {isSubmitting ? text.saving : text.saveToInventory}
            </button>
          </div>
        </div>

        {successMsg ? (
          <div className="mb-6 rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
            {successMsg}
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <form id="stock-in-form" onSubmit={handleSave}>
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <FormCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-primary"
                  >
                    <path
                      d="M12 5v14M5 12h14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                title={text.catalogSelection}
              >
                <div className="flex flex-wrap gap-2">
                  <ModeButton
                    active={form.medicineMode === "existing"}
                    onClick={() =>
                      updateField(
                        "medicineMode",
                        catalog.length > 0 ? "existing" : "new"
                      )
                    }
                    disabled={catalog.length === 0}
                    label={text.existingMedicine}
                    note={`${catalog.length} ${text.inCatalog}`}
                  />
                  <ModeButton
                    active={form.medicineMode === "new"}
                    onClick={() => updateField("medicineMode", "new")}
                    label={text.newCatalogItem}
                    note={text.createsMedicineAndBatch}
                  />
                </div>

                {form.medicineMode === "existing" ? (
                  <div className="mt-5">
                    <label
                      htmlFor="medicineId"
                      className="mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline"
                    >
                      {text.selectMedicine}
                    </label>
                    <select
                      id="medicineId"
                      value={form.medicineId}
                      onChange={(event) =>
                        updateField("medicineId", event.target.value)
                      }
                      className="h-11 w-full rounded-lg bg-surface-lowest px-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                      style={{
                        boxShadow: "0 1px 4px rgba(0,66,83,0.06)",
                        border: "1px solid rgba(0,66,83,0.10)",
                      }}
                    >
                      <option value="">{text.chooseCatalogMedicine}</option>
                      {catalog.map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>
                          {medicine.name}
                          {medicine.strength ? ` • ${medicine.strength}` : ""}
                          {medicine.form ? ` • ${medicine.form}` : ""}
                        </option>
                      ))}
                    </select>

                    {selectedMedicine ? (
                      <div
                        className="mt-4 rounded-lg bg-surface-low p-4"
                        style={{ border: "1px solid rgba(0,66,83,0.08)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-on-surface">
                              {selectedMedicine.name}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {[
                                selectedMedicine.genericName,
                                selectedMedicine.form,
                                selectedMedicine.strength,
                              ]
                                .filter(Boolean)
                                .join(" • ") || text.catalogRecord}
                            </p>
                          </div>
                          <span className="rounded-full bg-secondary-container px-2.5 py-1 text-[0.65rem] font-bold text-on-secondary-container">
                            {text.existing}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <AdjustField
                        id="name"
                        label={text.medicineName}
                        placeholder={text.placeholderAmoxicillin}
                        required
                        value={form.name}
                        onChange={(value) => updateField("name", value)}
                      />
                      <AdjustField
                        id="brandName"
                        label={text.brandName}
                        placeholder={text.placeholderAmoxil}
                        value={form.brandName}
                        onChange={(value) => updateField("brandName", value)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <AdjustField
                        id="genericName"
                        label={text.genericName}
                        placeholder={text.placeholderGeneric}
                        value={form.genericName}
                        onChange={(value) => updateField("genericName", value)}
                      />
                      <AdjustField
                        id="strength"
                        label={text.strength}
                        placeholder={text.placeholderStrength}
                        value={form.strength}
                        onChange={(value) => updateField("strength", value)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <AdjustField
                        id="form"
                        label={text.form}
                        placeholder={text.placeholderForm}
                        value={form.form}
                        onChange={(value) => updateField("form", value)}
                      />
                      <AdjustField
                        id="category"
                        label={text.category}
                        placeholder={text.placeholderCategory}
                        value={form.category}
                        onChange={(value) => updateField("category", value)}
                      />
                      <AdjustField
                        id="unit"
                        label={text.unit}
                        placeholder={text.placeholderUnit}
                        value={form.unit}
                        onChange={(value) => updateField("unit", value)}
                      />
                      <AdjustField
                        id="sku"
                        label={text.sku}
                        placeholder={text.placeholderSku}
                        value={form.sku}
                        onChange={(value) => updateField("sku", value)}
                      />
                    </div>
                  </div>
                )}
              </FormCard>

              <FormCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-on-tertiary-fixed-variant"
                  >
                    <path
                      d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                title={text.batchDetails}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <AdjustField
                    id="batchNumber"
                    label={text.batchNumber}
                    placeholder={text.placeholderBatchNumber}
                    required
                    value={form.batchNumber}
                    onChange={(value) => updateField("batchNumber", value)}
                  />
                  <AdjustField
                    id="receivedAt"
                    label={text.receivedDate}
                    type="date"
                    required
                    value={form.receivedAt}
                    onChange={(value) => updateField("receivedAt", value)}
                  />
                  <AdjustField
                    id="expiryDate"
                    label={text.expiryDate}
                    type="date"
                    required
                    value={form.expiryDate}
                    onChange={(value) => updateField("expiryDate", value)}
                  />
                </div>
              </FormCard>

              <FormCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-outline"
                  >
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" strokeLinecap="round" />
                  </svg>
                }
                title={text.quantityAndPricing}
              >
                <div className="grid gap-6 md:grid-cols-3">
                  <MetricInput
                    id="quantity"
                    label={text.quantityReceived}
                    suffix={text.units}
                    value={form.quantity}
                    onChange={(value) => updateField("quantity", value)}
                  />
                  <MetricInput
                    id="costPrice"
                    label={text.unitCostEtb}
                    value={form.costPrice}
                    onChange={(value) => updateField("costPrice", value)}
                  />
                  <MetricInput
                    id="sellingPrice"
                    label={text.sellingPriceEtb}
                    value={form.sellingPrice}
                    onChange={(value) => updateField("sellingPrice", value)}
                  />
                </div>
              </FormCard>
            </div>

            <div className="space-y-5">
              <FormCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-outline"
                  >
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <path
                      d="M16 8h4l3 3v5h-7V8z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                }
                title={text.supplierAndBranch}
              >
                <div className="space-y-4">
                  <AdjustField
                    id="supplierName"
                    label={text.supplierName}
                    placeholder={text.placeholderSupplier}
                    value={form.supplierName}
                    onChange={(value) => updateField("supplierName", value)}
                  />
                  <SummaryLine
                    label={text.receivingBranch}
                    value={session.branch?.name ?? text.defaultBranch}
                  />
                  <SummaryLine
                    label={text.operator}
                    value={session.user.fullName}
                  />
                  <SummaryLine
                    label={text.catalogRecords}
                    value={String(catalog.length)}
                  />
                </div>
              </FormCard>

              <div
                className="relative overflow-hidden rounded-lg p-6 text-white"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                <p className="mb-4 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-white/55">
                  {text.batchValuation}
                </p>
                <div className="space-y-3">
                  <SummaryLine
                    inverse
                    label={text.totalCost}
                    value={totalCost > 0 ? `${formatCurrency(totalCost, locale)} ETB` : text.notAvailable}
                  />
                  <SummaryLine
                    inverse
                    label={text.expectedRetailValue}
                    value={
                      expectedRevenue > 0
                        ? `${formatCurrency(expectedRevenue, locale)} ETB`
                        : text.notAvailable
                    }
                  />
                  <SummaryLine
                    inverse
                    label={text.projectedMargin}
                    value={
                      totalCost > 0 && expectedRevenue > 0
                        ? `${(((expectedRevenue - totalCost) / expectedRevenue) * 100).toFixed(1)}%`
                        : text.notAvailable
                    }
                  />
                </div>

                <div
                  className="mt-5 rounded-lg bg-white/10 p-4"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="text-xs font-semibold text-white/70">
                    {text.readyToReceive}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {selectedMedicine?.name || form.name || text.newStockBatch}
                  </p>
                  <p className="mt-1 text-xs text-white/70">
                    {text.batch} {form.batchNumber || text.notAvailable} • {text.expiry} {form.expiryDate || text.notAvailable}
                  </p>
                </div>
              </div>

              <div
                className="rounded-lg bg-surface-lowest p-5"
                style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
              >
                <p className="text-sm font-semibold text-on-surface">
                  {text.stockInRules}
                </p>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-on-surface-variant">
                  <li>{text.ruleUniqueBatch}</li>
                  <li>{text.ruleExpiryAfterReceived}</li>
                  <li>{text.ruleCreatesAudit}</li>
                </ul>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function FormCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg bg-surface-lowest p-6"
      style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "rgba(0,66,83,0.06)" }}
        >
          {icon}
        </div>
        <h2 className="text-[0.95rem] font-bold text-on-surface">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  note,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  note: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "min-w-[170px] rounded-lg px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "bg-primary/10 text-primary"
          : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
      ].join(" ")}
      style={active ? { border: "1px solid rgba(0,66,83,0.16)" } : undefined}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs opacity-80">{note}</p>
    </button>
  );
}

function AdjustField({
  id,
  label,
  type = "text",
  placeholder,
  required,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline"
      >
        {label}
        {required ? <span className="ml-0.5 text-on-error-container">*</span> : null}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg bg-surface-lowest px-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        style={{
          boxShadow: "0 1px 4px rgba(0,66,83,0.06)",
          border: "1px solid rgba(0,66,83,0.10)",
        }}
      />
    </div>
  );
}

function MetricInput({
  id,
  label,
  suffix,
  value,
  onChange,
}: {
  id: string;
  label: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-14 w-full rounded-lg bg-surface-lowest px-4 text-[1.8rem] font-bold tracking-[-0.04em] text-on-surface placeholder:text-[1.8rem] placeholder:font-bold placeholder:text-outline/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
          style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
        />
        {suffix ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-outline">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  inverse,
}: {
  label: string;
  value: string;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={inverse ? "text-sm text-white/70" : "text-sm text-on-surface-variant"}>
        {label}
      </span>
      <span className={inverse ? "text-sm font-bold text-white" : "text-sm font-semibold text-on-surface"}>
        {value}
      </span>
    </div>
  );
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const STOCK_IN_COPY = {
  en: {
    loadingStockIntake: "Loading stock intake…",
    selectMedicineBeforeReceiving: "Select a medicine before receiving stock.",
    medicineNameRequired: "Medicine name is required for a new catalog item.",
    stockReceivedMessage: "{medicine} batch {batch} is now in inventory.",
    inventory: "Inventory",
    receiveStock: "Receive Stock",
    receiveStockDescription:
      "Add a new batch into {branch} with real expiry, pricing, and supplier details.",
    defaultBranch: "the default branch",
    cancel: "Cancel",
    saving: "Saving…",
    saveToInventory: "Save to Inventory",
    catalogSelection: "Catalog Selection",
    existingMedicine: "Existing Medicine",
    inCatalog: "in catalog",
    newCatalogItem: "New Catalog Item",
    createsMedicineAndBatch: "Creates medicine + batch",
    selectMedicine: "Select Medicine",
    chooseCatalogMedicine: "Choose a catalog medicine",
    catalogRecord: "Catalog record",
    existing: "Existing",
    medicineName: "Medicine Name",
    placeholderAmoxicillin: "Amoxicillin",
    brandName: "Brand Name",
    placeholderAmoxil: "Amoxil",
    genericName: "Generic Name",
    placeholderGeneric: "Amoxicillin trihydrate",
    strength: "Strength",
    placeholderStrength: "500 mg",
    form: "Form",
    placeholderForm: "Tablet",
    category: "Category",
    placeholderCategory: "Antibiotic",
    unit: "Unit",
    placeholderUnit: "Box",
    sku: "SKU",
    placeholderSku: "MED-001",
    batchDetails: "Batch Details",
    batchNumber: "Batch Number",
    placeholderBatchNumber: "BN-44291-X",
    receivedDate: "Received Date",
    expiryDate: "Expiry Date",
    quantityAndPricing: "Quantity & Pricing",
    quantityReceived: "Quantity Received",
    units: "Units",
    unitCostEtb: "Unit Cost (ETB)",
    sellingPriceEtb: "Selling Price (ETB)",
    supplierAndBranch: "Supplier & Branch",
    supplierName: "Supplier Name",
    placeholderSupplier: "Ethiopian Pharma Supply Service",
    receivingBranch: "Receiving branch",
    operator: "Operator",
    catalogRecords: "Catalog records",
    batchValuation: "Batch Valuation",
    totalCost: "Total Cost",
    expectedRetailValue: "Expected Retail Value",
    projectedMargin: "Projected Margin",
    readyToReceive: "Ready to receive",
    newStockBatch: "New stock batch",
    batch: "Batch",
    expiry: "Expiry",
    notAvailable: "—",
    stockInRules: "Stock-in rules",
    ruleUniqueBatch: "Batch numbers must be unique per medicine in the same branch.",
    ruleExpiryAfterReceived: "Expiry date must be after the received date.",
    ruleCreatesAudit: "Each stock-in creates an audit log and inventory movement record.",
  },
  am: {
    loadingStockIntake: "የእቃ መቀበያ በመጫን ላይ…",
    selectMedicineBeforeReceiving: "እቃ ከመቀበልዎ በፊት መድሃኒት ይምረጡ።",
    medicineNameRequired: "ለአዲስ የካታሎግ እቃ የመድሃኒት ስም ያስፈልጋል።",
    stockReceivedMessage: "{medicine} ባች {batch} አሁን በእቃ ውስጥ ነው።",
    inventory: "እቃ",
    receiveStock: "እቃ ተቀበል",
    receiveStockDescription: "እውነተኛ ማብቂያ፣ ዋጋ እና የአቅራቢ ዝርዝር ያለውን አዲስ ባች ወደ {branch} ያክሉ።",
    defaultBranch: "ነባሪ ቅርንጫፍ",
    cancel: "ሰርዝ",
    saving: "በማስቀመጥ ላይ…",
    saveToInventory: "ወደ እቃ አስቀምጥ",
    catalogSelection: "የካታሎግ ምርጫ",
    existingMedicine: "ነባር መድሃኒት",
    inCatalog: "በካታሎግ ውስጥ",
    newCatalogItem: "አዲስ የካታሎግ እቃ",
    createsMedicineAndBatch: "መድሃኒት + ባች ይፈጥራል",
    selectMedicine: "መድሃኒት ይምረጡ",
    chooseCatalogMedicine: "ከካታሎግ መድሃኒት ይምረጡ",
    catalogRecord: "የካታሎግ መዝገብ",
    existing: "ነባር",
    medicineName: "የመድሃኒት ስም",
    placeholderAmoxicillin: "አሞክሲሲሊን",
    brandName: "የብራንድ ስም",
    placeholderAmoxil: "አሞክሲል",
    genericName: "ጄኔሪክ ስም",
    placeholderGeneric: "አሞክሲሲሊን ትራይሃይድሬት",
    strength: "ጥንካሬ",
    placeholderStrength: "500 mg",
    form: "ቅርጽ",
    placeholderForm: "ታብሌት",
    category: "ምድብ",
    placeholderCategory: "አንቲባዮቲክ",
    unit: "መለኪያ",
    placeholderUnit: "ሳጥን",
    sku: "SKU",
    placeholderSku: "MED-001",
    batchDetails: "የባች ዝርዝሮች",
    batchNumber: "የባች ቁጥር",
    placeholderBatchNumber: "BN-44291-X",
    receivedDate: "የተቀበለበት ቀን",
    expiryDate: "የማብቂያ ቀን",
    quantityAndPricing: "ብዛት እና ዋጋ",
    quantityReceived: "የተቀበለ ብዛት",
    units: "ዩኒቶች",
    unitCostEtb: "የአንድ ዩኒት ወጪ (ETB)",
    sellingPriceEtb: "የመሸጫ ዋጋ (ETB)",
    supplierAndBranch: "አቅራቢ እና ቅርንጫፍ",
    supplierName: "የአቅራቢ ስም",
    placeholderSupplier: "የኢትዮጵያ ፋርማ አቅርቦት አገልግሎት",
    receivingBranch: "ተቀባይ ቅርንጫፍ",
    operator: "ኦፕሬተር",
    catalogRecords: "የካታሎግ መዝገቦች",
    batchValuation: "የባች ግምት",
    totalCost: "ጠቅላላ ወጪ",
    expectedRetailValue: "የሚጠበቀው የችርቻሮ ዋጋ",
    projectedMargin: "የሚጠበቀው ትርፍ",
    readyToReceive: "ለመቀበል ዝግጁ",
    newStockBatch: "አዲስ የእቃ ባች",
    batch: "ባች",
    expiry: "ማብቂያ",
    notAvailable: "—",
    stockInRules: "የእቃ መግቢያ ደንቦች",
    ruleUniqueBatch: "በተመሳሳይ ቅርንጫፍ ውስጥ የባች ቁጥሮች ለእያንዳንዱ መድሃኒት ልዩ መሆን አለባቸው።",
    ruleExpiryAfterReceived: "የማብቂያ ቀን ከተቀበለበት ቀን በኋላ መሆን አለበት።",
    ruleCreatesAudit: "እያንዳንዱ የእቃ መግቢያ የኦዲት መዝገብ እና የእቃ እንቅስቃሴ መዝገብ ይፈጥራል።",
  },
  om: {
    loadingStockIntake: "Galmeen kuusaa fe'amaa jira…",
    selectMedicineBeforeReceiving: "Kuusaa fudhachuu dura qoricha filadhu.",
    medicineNameRequired: "Maqaan qorichaa meeshaa kaataalogii haaraaf barbaachisaadha.",
    stockReceivedMessage: "{medicine} baachiin {batch} amma kuusaa keessa jira.",
    inventory: "Kuusaa",
    receiveStock: "Kuusaa Fudhadhu",
    receiveStockDescription: "Baachii haaraa xumuramuu, gatii fi odeeffannoo dhiyeessaa dhugaa qabu gara {branch} dabali.",
    defaultBranch: "damee durtii",
    cancel: "Haqi",
    saving: "Olkaa'amaa jira…",
    saveToInventory: "Gara Kuusaatti Olkaa'i",
    catalogSelection: "Filannoo Kaataalogii",
    existingMedicine: "Qoricha Jiru",
    inCatalog: "kaataalogii keessa",
    newCatalogItem: "Meeshaa Kaataalogii Haaraa",
    createsMedicineAndBatch: "Qoricha + baachii uuma",
    selectMedicine: "Qoricha filadhu",
    chooseCatalogMedicine: "Qoricha kaataalogii filadhu",
    catalogRecord: "Galmee kaataalogii",
    existing: "Jira",
    medicineName: "Maqaa qorichaa",
    placeholderAmoxicillin: "Amoxicillin",
    brandName: "Maqaa biraandii",
    placeholderAmoxil: "Amoxil",
    genericName: "Maqaa generic",
    placeholderGeneric: "Amoxicillin trihydrate",
    strength: "Cimina",
    placeholderStrength: "500 mg",
    form: "Bifa",
    placeholderForm: "Tablet",
    category: "Gosa",
    placeholderCategory: "Antibiotic",
    unit: "Yuunitii",
    placeholderUnit: "Saanduqa",
    sku: "SKU",
    placeholderSku: "MED-001",
    batchDetails: "Odeeffannoo Baachii",
    batchNumber: "Lakkoofsa baachii",
    placeholderBatchNumber: "BN-44291-X",
    receivedDate: "Guyyaa fudhatame",
    expiryDate: "Guyyaa xumuraa",
    quantityAndPricing: "Baay'ina fi Gatii",
    quantityReceived: "Baay'ina fudhatame",
    units: "yuunitii",
    unitCostEtb: "Baasiin yuunitii tokkoo (ETB)",
    sellingPriceEtb: "Gatii gurgurtaa (ETB)",
    supplierAndBranch: "Dhiyeessaa fi Damee",
    supplierName: "Maqaa dhiyeessaa",
    placeholderSupplier: "Ethiopian Pharma Supply Service",
    receivingBranch: "Damee fudhatu",
    operator: "Hojii raawwataa",
    catalogRecords: "Galmeewwan kaataalogii",
    batchValuation: "Gatii Baachii",
    totalCost: "Baasiin waliigalaa",
    expectedRetailValue: "Gatii gabaaf dhiyaatu",
    projectedMargin: "Bu'aa eegamu",
    readyToReceive: "Fudhachuuf qophaa'eera",
    newStockBatch: "Baachii kuusaa haaraa",
    batch: "Baachii",
    expiry: "Xumuramuu",
    notAvailable: "—",
    stockInRules: "Seerota kuusaa galchuu",
    ruleUniqueBatch: "Lakkoofsi baachii damee tokko keessatti qoricha tokkoof adda ta'uu qaba.",
    ruleExpiryAfterReceived: "Guyyaan xumuraa guyyaa fudhatame booddee ta'uu qaba.",
    ruleCreatesAudit: "Kuusaan galuu hundi galmee odiitii fi sochii kuusaa uuma.",
  },
} as const;
