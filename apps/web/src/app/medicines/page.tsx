"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

type MedicineRecord = {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  sku: string | null;
  form: string | null;
  strength: string | null;
  category: string | null;
  unit: string | null;
  isActive: boolean;
  createdAt: string;
};

const PAGE_SIZE = 15;

export default function MedicinesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) { router.replace("/login"); return; }
    try {
      const sessionData = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sessionData.user.role === "CASHIER") { router.replace("/dashboard"); return; }
      const meds = await fetchJson<MedicineRecord[]>("/medicines", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSession(sessionData);
      setMedicines(meds);
    } catch (err) {
      window.localStorage.removeItem(TOKEN_KEY);
      setError(formatError(err));
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <LoadingScreen />;
  if (!session) return null;

  /* ── Derived data ── */
  const categories = ["All", ...Array.from(new Set(medicines.map((m) => m.category).filter(Boolean) as string[]))];

  const filtered = medicines.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search.trim() ||
      m.name.toLowerCase().includes(q) ||
      (m.genericName ?? "").toLowerCase().includes(q) ||
      (m.brandName ?? "").toLowerCase().includes(q) ||
      (m.sku ?? "").toLowerCase().includes(q);
    const matchesCat = categoryFilter === "All" || m.category === categoryFilter;
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Active" && m.isActive) ||
      (statusFilter === "Inactive" && !m.isActive);
    return matchesSearch && matchesCat && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeCount = medicines.filter((m) => m.isActive).length;

  return (
    <AppShell session={session}>
      <div className="px-8 py-8 max-w-[1200px] mx-auto w-full">

        {/* ── Page header ────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[2.25rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
              Inventory Intelligence
            </h1>
            <p className="mt-2 text-on-surface-variant text-sm max-w-sm leading-relaxed">
              Manage and monitor pharmaceutical stock levels with real-time analytics and expiry forecasting.
            </p>
          </div>
          <Link
            href="/medicines/adjust"
            className="flex items-center gap-2 h-11 px-5 rounded text-white text-sm font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add New Stock
          </Link>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
          <IntelCard label="Total Stock Value"   value="—"                note="ETB" />
          <IntelCard label="Items at Risk"       value="—"  valueColor="#93000a" note="Low stock + expiry risk" />
          <IntelCard label="Near Expiry (30d)"   value="—"  valueColor="#6e3900" note="Batches expiring soon" />
          <IntelCard label="Active Batches"      value={String(activeCount)}    note="Registered medicines" />
        </div>

        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div
          className="bg-surface-lowest rounded-lg"
          style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
        >
          <div className="flex flex-wrap items-center gap-3 px-6 py-4"
            style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
          >
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/50 pointer-events-none" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="Search medicines, batch numbers, or categories…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-surface-low text-on-surface text-sm
                  placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
              />
            </div>

            {/* Category filter */}
            <FilterChip
              label={`Category: ${categoryFilter}`}
              active={categoryFilter !== "All"}
              onClick={() => {
                const next = categories[(categories.indexOf(categoryFilter) + 1) % categories.length];
                setCategoryFilter(next ?? "All");
                setPage(1);
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />

            {/* Status filter */}
            <FilterChip
              label={`Status: ${statusFilter}`}
              active={statusFilter !== "All"}
              onClick={() => {
                const opts = ["All", "Active", "Inactive"];
                setStatusFilter(opts[(opts.indexOf(statusFilter) + 1) % opts.length] ?? "All");
                setPage(1);
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              }
            />

            <span className="ml-auto text-on-surface-variant text-xs">
              Showing {filtered.length === 0 ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}`} of {filtered.length} items
            </span>
          </div>

          {/* ── Table ─────────────────────────────────────────────── */}
          {error ? (
            <div className="m-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">{error}</div>
          ) : null}

          {medicines.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#70787d" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                </svg>
              }
              title="No medicines in catalog"
              desc='Add your first medicine using "Add New Stock". Each entry becomes available for stock-in and sales.'
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#70787d" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
              }
              title={`No results for "${search}"`}
              desc="Try a different name, generic, category, or SKU."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[0.65rem] font-bold tracking-[0.08em] uppercase text-outline"
                    style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                  >
                    <th className="px-6 py-3 font-bold">Brand Name</th>
                    <th className="px-4 py-3 font-bold">Generic Name</th>
                    <th className="px-4 py-3 font-bold">Batch #</th>
                    <th className="px-4 py-3 font-bold">Expiry Date</th>
                    <th className="px-4 py-3 font-bold text-right">Stock</th>
                    <th className="px-4 py-3 font-bold text-right">Price (ETB)</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((med, i) => (
                    <MedicineRow
                      key={med.id}
                      med={med}
                      striped={i % 2 !== 0}
                      canEdit={session.user.role !== "CASHIER"}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 py-5"
              style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
            >
              <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </PageBtn>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <PageBtn key={p} active={page === p} onClick={() => setPage(p)}>
                  {p}
                </PageBtn>
              ))}

              {totalPages > 5 && (
                <>
                  <span className="px-2 text-outline text-sm">…</span>
                  <PageBtn onClick={() => setPage(totalPages)}>{totalPages}</PageBtn>
                </>
              )}

              <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </PageBtn>
            </div>
          )}
        </div>
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
        <p className="text-on-surface-variant text-sm font-medium">Loading inventory…</p>
      </div>
    </div>
  );
}

function IntelCard({ label, value, valueColor, note }: { label: string; value: string; valueColor?: string; note: string }) {
  return (
    <div className="bg-surface-lowest rounded-lg p-5" style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}>
      <p className="text-[0.65rem] font-bold tracking-[0.08em] uppercase text-outline mb-2">{label}</p>
      <p className="text-[2.5rem] font-bold leading-none tracking-[-0.04em]" style={{ color: valueColor ?? "#191c1e" }}>
        {value}
      </p>
      <p className="text-on-surface-variant text-xs mt-1">{note}</p>
    </div>
  );
}

function FilterChip({
  label, active, onClick, icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer",
        active
          ? "bg-primary/10 text-primary"
          : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function MedicineRow({
  med, striped, canEdit,
}: {
  med: MedicineRecord;
  striped: boolean;
  canEdit: boolean;
}) {
  const isLowStock = false; // placeholder until stock batch API
  const isExpiringSoon = false; // placeholder

  return (
    <tr
      className={[
        "group",
        isLowStock || isExpiringSoon ? "border-l-[3px] border-on-error-container" : "",
        striped ? "bg-surface" : "bg-surface-lowest",
      ].join(" ")}
      style={{ borderBottom: "1px solid rgba(0,66,83,0.05)" }}
    >
      {/* Brand */}
      <td className="px-6 py-4 align-top">
        <p className="text-on-surface font-semibold text-sm">{med.name}</p>
        {med.form && (
          <p className="text-on-surface-variant text-xs mt-0.5">{med.form}</p>
        )}
      </td>

      {/* Generic */}
      <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
        {med.genericName ?? "—"}
      </td>

      {/* Batch (SKU as proxy) */}
      <td className="px-4 py-4 align-top">
        {med.sku ? (
          <code className="text-xs text-on-surface-variant bg-surface-low rounded px-1.5 py-0.5 font-mono">
            {med.sku}
          </code>
        ) : (
          <span className="text-outline/50 text-sm">—</span>
        )}
      </td>

      {/* Expiry */}
      <td className="px-4 py-4 align-top text-on-surface-variant text-sm">—</td>

      {/* Stock */}
      <td className="px-4 py-4 align-top text-right">
        <span className="text-on-surface text-sm font-medium">—</span>
      </td>

      {/* Price */}
      <td className="px-4 py-4 align-top text-right">
        <p className="text-on-surface-variant text-xs">— Buy</p>
        <p className="text-on-surface-variant text-xs">— Sell</p>
      </td>

      {/* Status */}
      <td className="px-4 py-4 align-top">
        <StatusChip isActive={med.isActive} />
      </td>

      {/* Actions */}
      <td className="px-4 py-4 align-top">
        {canEdit && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link href={`/medicines/adjust?id=${med.id}`} title="Edit" className="p-1.5 rounded hover:bg-surface-low transition-colors text-on-surface-variant hover:text-on-surface">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </Link>
            <Link href="/medicines/adjust" title="Adjust stock" className="p-1.5 rounded hover:bg-surface-low transition-colors text-on-surface-variant hover:text-on-surface">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </Link>
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusChip({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.65rem] font-bold tracking-wide ${
      isActive
        ? "bg-secondary-container text-on-secondary-container"
        : "bg-error-container text-on-error-container"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-on-secondary-container" : "bg-on-error-container"}`} />
      {isActive ? "Normal" : "Inactive"}
    </span>
  );
}

function EmptyState({
  icon, title, desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="py-16 flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(0,66,83,0.06)" }}>
        {icon}
      </div>
      <p className="text-on-surface font-semibold text-sm">{title}</p>
      <p className="text-on-surface-variant text-xs max-w-[280px] text-center leading-relaxed">{desc}</p>
    </div>
  );
}

function PageBtn({
  children, active, onClick, disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-8 h-8 rounded flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default",
        active
          ? "text-white"
          : "text-on-surface-variant hover:bg-surface-low",
      ].join(" ")}
      style={active ? { background: "linear-gradient(135deg, #004253, #005b71)" } : undefined}
    >
      {children}
    </button>
  );
}
