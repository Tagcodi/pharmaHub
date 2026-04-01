"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import {
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type InventoryMedicineSummary,
  type InventorySummaryResponse,
  type SessionResponse,
} from "../lib/api";

const PAGE_SIZE = 12;

export default function MedicinesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [inventory, setInventory] = useState<InventorySummaryResponse | null>(null);
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

      const inventoryData = await fetchJson<InventorySummaryResponse>(
        "/inventory/summary",
        {
          headers: getAuthHeaders(token),
        }
      );

      setInventory(inventoryData);
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

  if (isLoading) {
    return <AppLoading message="Loading inventory…" />;
  }

  if (!session) {
    return null;
  }

  const medicines = inventory?.medicines ?? [];
  const totals = inventory?.totals ?? {
    totalStockValue: 0,
    totalCostValue: 0,
    activeBatchCount: 0,
    registeredMedicineCount: 0,
    lowStockCount: 0,
    nearExpiryBatchCount: 0,
    totalUnitsOnHand: 0,
    atRiskCount: 0,
  };

  const categories = [
    "All",
    ...Array.from(
      new Set(
        medicines
          .map((medicine) => medicine.category)
          .filter((value): value is string => Boolean(value))
      )
    ),
  ];

  const filteredMedicines = medicines.filter((medicine) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      medicine.name.toLowerCase().includes(query) ||
      (medicine.genericName ?? "").toLowerCase().includes(query) ||
      (medicine.brandName ?? "").toLowerCase().includes(query) ||
      (medicine.latestBatchNumber ?? "").toLowerCase().includes(query) ||
      (medicine.category ?? "").toLowerCase().includes(query);
    const matchesCategory =
      categoryFilter === "All" || medicine.category === categoryFilter;
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Low Stock" && medicine.isLowStock) ||
      (statusFilter === "Near Expiry" && medicine.isExpiringSoon) ||
      (statusFilter === "Stable" &&
        medicine.isActive &&
        !medicine.isLowStock &&
        !medicine.isExpiringSoon) ||
      (statusFilter === "Inactive" && !medicine.isActive);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMedicines.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedMedicines = filteredMedicines.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[2.25rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              Inventory Intelligence
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
              Track live stock by batch, expiry window, and retail value for{" "}
              {inventory?.branch.name ?? session.branch?.name ?? "your main branch"}.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/medicines/adjustments"
              className="flex h-11 items-center gap-2 rounded border border-outline/15 bg-surface-low px-5 text-sm font-bold text-on-surface transition-colors hover:bg-surface"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Adjust Stock
            </Link>

            <Link
              href="/medicines/adjust"
              className="flex h-11 items-center gap-2 rounded px-5 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1v12M1 7h12"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Receive Stock
            </Link>
          </div>
        </div>

        <div className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Stock Value"
            value={`ETB ${formatNumber(totals.totalStockValue)}`}
            note={`${totals.totalUnitsOnHand.toLocaleString("en-US")} units on hand`}
          />
          <KpiCard
            label="Medicines At Risk"
            value={String(totals.atRiskCount)}
            valueColor="#93000a"
            note={`${totals.lowStockCount} low stock / ${totals.nearExpiryBatchCount} expiring batches`}
          />
          <KpiCard
            label="Near Expiry (30d)"
            value={String(totals.nearExpiryBatchCount)}
            valueColor="#6e3900"
            note="Batches requiring close review"
          />
          <KpiCard
            label="Active Batches"
            value={String(totals.activeBatchCount)}
            note={`${totals.registeredMedicineCount} catalog medicines`}
          />
        </div>

        <SurfaceCard className="overflow-hidden">
          <div
            className="flex flex-wrap items-center gap-3 px-6 py-4"
            style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
          >
            <div className="relative min-w-[220px] flex-1">
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
                placeholder="Search medicines, generic names, or batch numbers…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <FilterChip
              label={`Category: ${categoryFilter}`}
              active={categoryFilter !== "All"}
              onClick={() => {
                const nextIndex =
                  (categories.indexOf(categoryFilter) + 1) % categories.length;
                setCategoryFilter(categories[nextIndex] ?? "All");
                setPage(1);
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 3h10M3 6h6M5 9h2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              }
            />

            <FilterChip
              label={`Status: ${statusFilter}`}
              active={statusFilter !== "All"}
              onClick={() => {
                const options = [
                  "All",
                  "Low Stock",
                  "Near Expiry",
                  "Stable",
                  "Inactive",
                ];
                const nextIndex =
                  (options.indexOf(statusFilter) + 1) % options.length;
                setStatusFilter(options[nextIndex] ?? "All");
                setPage(1);
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle
                    cx="6"
                    cy="6"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              }
            />

            <span className="ml-auto text-xs text-on-surface-variant">
              Showing{" "}
              {filteredMedicines.length === 0
                ? "0"
                : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                    safePage * PAGE_SIZE,
                    filteredMedicines.length
                  )}`}{" "}
              of {filteredMedicines.length} items
            </span>
          </div>

          {error ? (
            <div className="m-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {error}
            </div>
          ) : null}

          {!error && medicines.length === 0 ? (
            <EmptyStateCard
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#70787d"
                  strokeWidth="1.5"
                >
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                </svg>
              }
              title="No medicines in inventory yet"
              description="Receive your first stock batch to create a live inventory record with expiry and quantity tracking."
            />
          ) : null}

          {!error && medicines.length > 0 && filteredMedicines.length === 0 ? (
            <EmptyStateCard
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#70787d"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
              }
              title={`No results for "${search}"`}
              description="Try a different medicine name, generic, batch number, or category."
            />
          ) : null}

          {!error && paginatedMedicines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr
                    className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline"
                    style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                  >
                    <th className="px-6 py-3 font-bold">Brand Name</th>
                    <th className="px-4 py-3 font-bold">Generic Name</th>
                    <th className="px-4 py-3 font-bold">Latest Batch</th>
                    <th className="px-4 py-3 font-bold">Next Expiry</th>
                    <th className="px-4 py-3 text-right font-bold">Stock</th>
                    <th className="px-4 py-3 text-right font-bold">Price (ETB)</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMedicines.map((medicine, index) => (
                    <MedicineRow
                      key={medicine.id}
                      medicine={medicine}
                      striped={index % 2 !== 0}
                      canEdit={session.user.role !== "CASHIER"}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div
              className="flex items-center justify-center gap-1 py-5"
              style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
            >
              <PageButton
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M9 3L5 7l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </PageButton>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <PageButton
                    key={pageNumber}
                    active={safePage === pageNumber}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </PageButton>
                )
              )}

              {totalPages > 5 ? (
                <>
                  <span className="px-2 text-sm text-outline">…</span>
                  <PageButton onClick={() => setPage(totalPages)}>
                    {totalPages}
                  </PageButton>
                </>
              ) : null}

              <PageButton
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={safePage === totalPages}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M5 3l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </PageButton>
            </div>
          ) : null}
        </SurfaceCard>
      </div>
    </AppShell>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  icon,
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
        "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
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
  medicine,
  striped,
  canEdit,
}: {
  medicine: InventoryMedicineSummary;
  striped: boolean;
  canEdit: boolean;
}) {
  const healthTone = medicine.isLowStock || medicine.isExpiringSoon;

  return (
    <tr
      className={[
        "group",
        healthTone ? "border-l-[3px] border-on-error-container" : "",
        striped ? "bg-surface" : "bg-surface-lowest",
      ].join(" ")}
      style={{ borderBottom: "1px solid rgba(0,66,83,0.05)" }}
    >
      <td className="px-6 py-4 align-top">
        <p className="text-sm font-semibold text-on-surface">{medicine.name}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {[medicine.form, medicine.strength].filter(Boolean).join(" • ") || "Catalog item"}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-sm text-on-surface-variant">
        {medicine.genericName ?? "—"}
      </td>

      <td className="px-4 py-4 align-top">
        {medicine.latestBatchNumber ? (
          <code className="rounded bg-surface-low px-1.5 py-0.5 font-mono text-xs text-on-surface-variant">
            {medicine.latestBatchNumber}
          </code>
        ) : (
          <span className="text-sm text-outline/50">—</span>
        )}
      </td>

      <td className="px-4 py-4 align-top">
        {medicine.nextExpiryDate ? (
          <>
            <p className="text-sm text-on-surface">{formatDate(medicine.nextExpiryDate)}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {describeExpiry(medicine.nextExpiryDate)}
            </p>
          </>
        ) : (
          <span className="text-sm text-outline/50">—</span>
        )}
      </td>

      <td className="px-4 py-4 text-right align-top">
        <p className="text-sm font-semibold text-on-surface">
          {medicine.totalQuantityOnHand.toLocaleString("en-US")}
        </p>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {medicine.activeBatchCount} active batches
        </p>
      </td>

      <td className="px-4 py-4 text-right align-top">
        <p className="text-xs text-on-surface-variant">
          {medicine.latestCostPrice !== null
            ? `${formatNumber(medicine.latestCostPrice)} buy`
            : "— buy"}
        </p>
        <p className="text-xs text-on-surface-variant">
          {medicine.latestSellingPrice !== null
            ? `${formatNumber(medicine.latestSellingPrice)} sell`
            : "— sell"}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <StatusChip medicine={medicine} />
      </td>

      <td className="px-4 py-4 align-top">
        {canEdit ? (
          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Link
              href={`/medicines/adjust?medicineId=${medicine.id}`}
              title="Receive stock"
              className="rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-low hover:text-on-surface"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
            <Link
              href={`/medicines/adjustments?medicineId=${medicine.id}`}
              title="Adjust stock"
              className="rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-low hover:text-on-surface"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M5 12h14" />
              </svg>
            </Link>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function StatusChip({ medicine }: { medicine: InventoryMedicineSummary }) {
  let label = "Stable";
  let tone: "success" | "warning" | "danger" | "neutral" = "success";

  if (!medicine.isActive) {
    label = "Inactive";
    tone = "danger";
  } else if (medicine.totalQuantityOnHand === 0) {
    label = "Out of Stock";
    tone = "danger";
  } else if (medicine.isLowStock && medicine.isExpiringSoon) {
    label = "Low + Expiry";
    tone = "warning";
  } else if (medicine.isLowStock) {
    label = "Low Stock";
    tone = "danger";
  } else if (medicine.isExpiringSoon) {
    label = "Near Expiry";
    tone = "warning";
  }

  return <StatusBadge label={label} tone={tone} />;
}

function PageButton({
  children,
  active,
  onClick,
  disabled,
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
        "flex h-8 w-8 cursor-pointer items-center justify-center rounded text-sm font-semibold transition-colors disabled:cursor-default disabled:opacity-40",
        active ? "text-white" : "text-on-surface-variant hover:bg-surface-low",
      ].join(" ")}
      style={
        active ? { background: "linear-gradient(135deg, #004253, #005b71)" } : undefined
      }
    >
      {children}
    </button>
  );
}

function formatNumber(value: number) {
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

function describeExpiry(value: string) {
  const diffInDays = Math.ceil(
    (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays < 0) {
    return "Already expired";
  }

  if (diffInDays === 0) {
    return "Expires today";
  }

  if (diffInDays === 1) {
    return "1 day remaining";
  }

  return `${diffInDays} days remaining`;
}
