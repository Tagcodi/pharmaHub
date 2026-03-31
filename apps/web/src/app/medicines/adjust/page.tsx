"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../../lib/api";

const ADJUSTMENT_REASONS = [
  "New Stock Entry",
  "Damage",
  "Expired",
  "Count Correction",
  "Return to Supplier",
  "Lost",
  "Theft Suspected",
  "Other",
];

const UNIT_TYPES = [
  "Box (10×10 Strips)",
  "Box (30 Tablets)",
  "Bottle (100ml)",
  "Vial (10ml)",
  "Ampoule (1ml)",
  "Sachet",
  "Strip (10 Tablets)",
  "Tube (30g)",
  "Unit",
];

const CATEGORIES = [
  "Antibiotics",
  "Analgesics",
  "Antihypertensives",
  "Antidiabetics",
  "Cardiovascular",
  "Dermatology",
  "Gastrointestinal",
  "Ophthalmology",
  "Vitamins & Supplements",
  "Other",
];

const initialForm = {
  brandName: "",
  genericName: "",
  unitType: "",
  category: "",
  supplierName: "",
  invoiceRef: "",
  batchNumber: "",
  manufactureDate: "",
  expiryDate: "",
  adjustmentReason: "New Stock Entry",
  quantity: "",
  buyingPrice: "",
  sellingPrice: "",
};

export default function StockAdjustPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAutoFill, setShowAutoFill] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSession() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) { router.replace("/login"); return; }
    try {
      const data = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.user.role === "CASHIER") { router.replace("/dashboard"); return; }
      setSession(data);
    } catch (err) {
      void formatError(err);
      window.localStorage.removeItem(TOKEN_KEY);
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  }

  function field(key: keyof typeof initialForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  const qty = parseFloat(form.quantity) || 0;
  const buy = parseFloat(form.buyingPrice) || 0;
  const sell = parseFloat(form.sellingPrice) || 0;
  const totalCost = qty * buy;
  const expectedRevenue = qty * sell;

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.brandName.trim()) { setError("Brand name is required."); return; }

    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) { router.replace("/login"); return; }

    setIsSubmitting(true);
    setError(null);

    try {
      // Creates the medicine catalog entry; stock batch endpoint coming soon
      await fetchJson("/medicines", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:        form.brandName,
          genericName: form.genericName || undefined,
          brandName:   form.brandName,
          sku:         form.batchNumber || undefined,
          category:    form.category   || undefined,
          unit:        form.unitType   || undefined,
        }),
      });
      setSuccessMsg("Medicine saved to catalog. Stock batch support coming soon.");
      setTimeout(() => { setSuccessMsg(null); router.push("/medicines"); }, 2500);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingScreen />;
  if (!session) return null;

  return (
    <AppShell session={session}>
      <div className="px-8 py-8 max-w-[1200px] mx-auto w-full">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <nav className="flex items-center gap-2 text-xs text-on-surface-variant mb-5">
          <Link href="/medicines" className="hover:text-on-surface transition-colors">
            Inventory
          </Link>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-on-surface font-semibold">Adjust Stock</span>
        </nav>

        {/* ── Page title + actions ────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[2rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
            Stock Adjustment{" "}
            <span className="text-outline/40 font-light">/ Add New</span>
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/medicines"
              className="h-10 px-5 rounded flex items-center text-on-surface text-sm font-semibold hover:bg-surface-high transition-colors"
              style={{ border: "1px solid rgba(0,66,83,0.14)" }}
            >
              Discard Changes
            </Link>
            <button
              form="adjust-form"
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-5 rounded flex items-center gap-2 text-white text-sm font-bold disabled:opacity-60 transition-opacity cursor-pointer"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" strokeLinecap="round" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {isSubmitting ? "Saving…" : "Save to Inventory"}
            </button>
          </div>
        </div>

        {/* ── Feedback ───────────────────────────────────────────── */}
        {successMsg && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-secondary-container text-on-secondary-container text-sm">
            {successMsg}
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">
            {error}
          </div>
        )}

        <form id="adjust-form" onSubmit={handleSave}>
          <div className="grid lg:grid-cols-[1fr_340px] gap-5">

            {/* ── Left column ──────────────────────────────────────── */}
            <div className="space-y-5">

              {/* Medicine Information */}
              <FormCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-primary">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                title="Medicine Information"
              >
                <div className="grid grid-cols-2 gap-4">
                  <AdjustField id="brandName" label="Brand Name" placeholder="Amoxicillin 500mg" required value={form.brandName} onChange={field("brandName")} />
                  <AdjustField id="genericName" label="Generic Name" placeholder="Amoxicillin Trihydrate" value={form.genericName} onChange={field("genericName")} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <AdjustSelect id="unitType" label="Unit Type" value={form.unitType} onChange={field("unitType")} options={UNIT_TYPES} placeholder="Select unit type" />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <AdjustSelect id="category" label="Category" value={form.category} onChange={field("category")} options={CATEGORIES} placeholder="Select category" />
                    </div>
                    <button
                      type="button"
                      className="mt-[22px] w-9 h-11 rounded-lg flex items-center justify-center shrink-0 text-white cursor-pointer"
                      style={{ background: "rgba(0,66,83,0.12)", color: "#004253" }}
                      title="Add new category"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </FormCard>

              {/* Batch Details */}
              <FormCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-on-tertiary-fixed-variant">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                title="Batch Details"
              >
                <div className="grid grid-cols-3 gap-4">
                  <AdjustField id="batchNumber" label="Batch Number" placeholder="BN-44291-X" value={form.batchNumber} onChange={field("batchNumber")} />
                  <AdjustField id="manufactureDate" label="Manufacture Date" type="date" value={form.manufactureDate} onChange={field("manufactureDate")} />
                  <AdjustField id="expiryDate" label="Expiry Date" type="date" value={form.expiryDate} onChange={field("expiryDate")} />
                </div>
              </FormCard>

              {/* Quantity & Financials */}
              <FormCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-outline">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" strokeLinecap="round" />
                  </svg>
                }
                title="Quantity & Financials"
              >
                <div className="grid grid-cols-3 gap-6">
                  {/* Qty */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
                      Quantity Received
                    </label>
                    <div className="relative">
                      <input
                        id="quantity"
                        type="number"
                        min="1"
                        placeholder="0"
                        value={form.quantity}
                        onChange={field("quantity")}
                        className="w-full h-14 px-4 rounded-lg bg-surface-lowest text-on-surface text-[1.8rem] font-bold
                          tracking-[-0.04em] placeholder:text-outline/30 placeholder:text-[1.8rem] placeholder:font-bold
                          focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline text-xs font-semibold uppercase tracking-wide">
                        Units
                      </span>
                    </div>
                  </div>

                  {/* Buy */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
                      Unit Buying Price (ETB)
                    </label>
                    <input
                      id="buyingPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.buyingPrice}
                      onChange={field("buyingPrice")}
                      className="w-full h-14 px-4 rounded-lg bg-surface-lowest text-on-surface text-[1.8rem] font-bold
                        tracking-[-0.04em] placeholder:text-outline/30 placeholder:text-[1.8rem] placeholder:font-bold
                        focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                      style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
                    />
                  </div>

                  {/* Sell */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
                      Unit Selling Price (ETB)
                    </label>
                    <input
                      id="sellingPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.sellingPrice}
                      onChange={field("sellingPrice")}
                      className="w-full h-14 px-4 rounded-lg bg-surface-lowest text-on-surface text-[1.8rem] font-bold
                        tracking-[-0.04em] placeholder:text-outline/30 placeholder:text-[1.8rem] placeholder:font-bold
                        focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                      style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
                    />
                  </div>
                </div>
              </FormCard>
            </div>

            {/* ── Right column ───────────────────────────────────── */}
            <div className="space-y-5">

              {/* Supplier Info */}
              <FormCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-outline">
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <path d="M16 8h4l3 3v5h-7V8z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                }
                title="Supplier Info"
              >
                <div className="space-y-4">
                  <AdjustField id="supplierName" label="Supplier Name" placeholder="Ethiopian Pharma Supply Service" value={form.supplierName} onChange={field("supplierName")} />
                  <AdjustField id="invoiceRef" label="Invoice Reference" placeholder="REF-2023-001" value={form.invoiceRef} onChange={field("invoiceRef")} />

                  {/* Upload */}
                  <div>
                    <label className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline block mb-1.5">
                      Digital Invoice
                    </label>
                    <button
                      type="button"
                      className="w-full h-24 rounded-lg flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs font-semibold hover:bg-surface-high transition-colors cursor-pointer"
                      style={{ border: "1.5px dashed rgba(0,66,83,0.20)" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" strokeLinecap="round" />
                        <polyline points="9 15 12 12 15 15" strokeLinecap="round" />
                      </svg>
                      Upload Digital Invoice
                    </button>
                  </div>
                </div>
              </FormCard>

              {/* Adjustment Logic */}
              <FormCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-on-error-container">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                    <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
                  </svg>
                }
                title="Adjustment Logic"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
                    Reason for Adjustment
                  </label>
                  <select
                    id="adjustmentReason"
                    value={form.adjustmentReason}
                    onChange={field("adjustmentReason")}
                    className="h-11 px-4 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow cursor-pointer"
                    style={{
                      background: "#fff7f3",
                      color: "#6e3900",
                      border: "1px solid rgba(110,57,0,0.20)",
                      boxShadow: "0 1px 4px rgba(0,66,83,0.06)",
                    }}
                  >
                    {ADJUSTMENT_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </FormCard>

              {/* Valuation Summary */}
              <div
                className="rounded-lg p-6 text-white relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-white/50 mb-4">
                  Valuation Summary
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Total Cost</span>
                    <span className="text-white font-bold text-sm">
                      {totalCost > 0 ? `${totalCost.toFixed(2)} ETB` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Expected Revenue</span>
                    <span className="text-white font-bold text-base">
                      {expectedRevenue > 0 ? `${expectedRevenue.toFixed(2)} ETB` : "—"}
                    </span>
                  </div>
                  {totalCost > 0 && expectedRevenue > 0 && (
                    <div
                      className="flex items-center justify-between pt-3"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <span className="text-white/70 text-xs">Margin</span>
                      <span className="text-white text-xs font-bold">
                        {(((expectedRevenue - totalCost) / expectedRevenue) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="w-full mt-6 h-10 rounded flex items-center justify-center gap-2 text-sm font-bold cursor-pointer transition-opacity hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  Preview Labels
                </button>
              </div>

              {/* Auto-Fill toast */}
              {showAutoFill && (
                <div
                  className="rounded-lg p-4 flex items-start gap-3"
                  style={{
                    background: "rgba(255,255,255,0.95)",
                    border: "1px solid rgba(0,66,83,0.10)",
                    boxShadow: "0 8px 24px rgba(0,66,83,0.10)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(110,57,0,0.10)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6e3900" strokeWidth="2">
                      <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" strokeLinecap="round" />
                      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" strokeLinecap="round" />
                      <path d="M8 16H3v5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-on-surface text-xs font-bold">Auto-Fill Detected</p>
                    <p className="text-on-surface-variant text-xs mt-0.5">
                      Prices matched from last EPSS invoice (Oct 22).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAutoFill(false)}
                    className="text-primary text-[0.65rem] font-bold tracking-wide uppercase shrink-0 cursor-pointer hover:underline"
                  >
                    Revert
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader" />
        <p className="text-on-surface-variant text-sm font-medium">Loading…</p>
      </div>
    </div>
  );
}

function FormCard({
  icon, title, children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-surface-lowest rounded-lg p-6"
      style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
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

function AdjustField({
  id, label, type = "text", placeholder, required, value, onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
        {label}
        {required && <span className="text-on-error-container ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={onChange}
        className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm
          placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)", border: "1px solid rgba(0,66,83,0.10)" }}
      />
    </div>
  );
}

function AdjustSelect({
  id, label, value, onChange, options, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.7rem] font-bold tracking-[0.06em] uppercase text-outline">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow cursor-pointer"
        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)", border: "1px solid rgba(0,66,83,0.10)" }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
