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
import { useI18n } from "../i18n/I18nProvider";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../i18n/format";
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
const STATUS_FILTERS = [
  "All",
  "Low Stock",
  "Near Expiry",
  "Stable",
  "Inactive",
] as const;

export default function MedicinesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = MEDICINES_COPY[locale] as (typeof MEDICINES_COPY)["en"];
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
    return <AppLoading message={text.loadingInventory} />;
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
  const branchName = inventory?.branch.name ?? session.branch?.name ?? text.defaultBranch;

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[2.25rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {text.inventoryIntelligence}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
              {text.inventoryDescription.replace("{branch}", branchName)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/purchase-orders"
              className="flex h-11 items-center gap-2 rounded border border-outline/15 bg-surface-low px-5 text-sm font-bold text-on-surface transition-colors hover:bg-surface"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 2.5h8M3 6.5h8M3 10.5h5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {text.restockOrders}
            </Link>

            <Link
              href="/medicines/counts"
              className="flex h-11 items-center gap-2 rounded border border-outline/15 bg-surface-low px-5 text-sm font-bold text-on-surface transition-colors hover:bg-surface"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 2.5h8M3 6.5h8M3 10.5h5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {text.stockCount}
            </Link>

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
              {text.adjustStock}
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
              {text.receiveStock}
            </Link>
          </div>
        </div>

        <div className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={text.totalStockValue}
            value={`ETB ${formatCurrency(totals.totalStockValue, locale)}`}
            note={`${formatNumber(totals.totalUnitsOnHand, locale)} ${text.unitsOnHand}`}
          />
          <KpiCard
            label={text.medicinesAtRisk}
            value={String(totals.atRiskCount)}
            valueColor="#93000a"
            note={`${formatNumber(totals.lowStockCount, locale)} ${text.lowStockLower} / ${formatNumber(totals.nearExpiryBatchCount, locale)} ${text.expiringBatches}`}
          />
          <KpiCard
            label={text.nearExpiryThirtyDays}
            value={String(totals.nearExpiryBatchCount)}
            valueColor="#6e3900"
            note={text.closeReview}
          />
          <KpiCard
            label={text.activeBatches}
            value={String(totals.activeBatchCount)}
            note={`${formatNumber(totals.registeredMedicineCount, locale)} ${text.catalogMedicines}`}
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
                placeholder={text.searchPlaceholder}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <FilterChip
              label={`${text.category}: ${categoryFilter === "All" ? text.all : categoryFilter}`}
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
              label={`${text.status}: ${getStatusLabel(statusFilter, text)}`}
              active={statusFilter !== "All"}
              onClick={() => {
                const nextIndex =
                  (STATUS_FILTERS.indexOf(statusFilter as (typeof STATUS_FILTERS)[number]) + 1) % STATUS_FILTERS.length;
                setStatusFilter(STATUS_FILTERS[nextIndex] ?? "All");
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
              {text.showing}{" "}
              {filteredMedicines.length === 0
                ? formatNumber(0, locale)
                : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                    safePage * PAGE_SIZE,
                    filteredMedicines.length
                  )}`}{" "}
              {text.of} {formatNumber(filteredMedicines.length, locale)} {text.items}
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
              title={text.noMedicinesTitle}
              description={text.noMedicinesDescription}
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
              title={text.noResultsTitle.replace("{query}", search)}
              description={text.noResultsDescription}
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
                    <th className="px-6 py-3 font-bold">{text.brandName}</th>
                    <th className="px-4 py-3 font-bold">{text.genericName}</th>
                    <th className="px-4 py-3 font-bold">{text.latestBatch}</th>
                    <th className="px-4 py-3 font-bold">{text.nextExpiry}</th>
                    <th className="px-4 py-3 text-right font-bold">{text.stock}</th>
                    <th className="px-4 py-3 text-right font-bold">{text.priceEtb}</th>
                    <th className="px-4 py-3 font-bold">{text.status}</th>
                    <th className="px-4 py-3 font-bold">{text.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMedicines.map((medicine, index) => (
                    <MedicineRow
                      key={medicine.id}
                      medicine={medicine}
                      striped={index % 2 !== 0}
                      canEdit={session.user.role !== "CASHIER"}
                      locale={locale}
                      text={text}
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
  locale,
  text,
}: {
  medicine: InventoryMedicineSummary;
  striped: boolean;
  canEdit: boolean;
  locale: "en" | "am" | "om";
  text: (typeof MEDICINES_COPY)["en"];
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
          {[medicine.form, medicine.strength].filter(Boolean).join(" • ") || text.catalogItem}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-sm text-on-surface-variant">
        {medicine.genericName ?? text.notAvailable}
      </td>

      <td className="px-4 py-4 align-top">
        {medicine.latestBatchNumber ? (
          <code className="rounded bg-surface-low px-1.5 py-0.5 font-mono text-xs text-on-surface-variant">
            {medicine.latestBatchNumber}
          </code>
        ) : (
          <span className="text-sm text-outline/50">{text.notAvailable}</span>
        )}
      </td>

      <td className="px-4 py-4 align-top">
        {medicine.nextExpiryDate ? (
          <>
            <p className="text-sm text-on-surface">{formatDate(medicine.nextExpiryDate, locale)}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {describeExpiry(medicine.nextExpiryDate, locale, text)}
            </p>
          </>
        ) : (
          <span className="text-sm text-outline/50">{text.notAvailable}</span>
        )}
      </td>

      <td className="px-4 py-4 text-right align-top">
        <p className="text-sm font-semibold text-on-surface">
          {formatNumber(medicine.totalQuantityOnHand, locale)}
        </p>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {formatNumber(medicine.activeBatchCount, locale)} {text.activeBatchesLower}
        </p>
      </td>

      <td className="px-4 py-4 text-right align-top">
        <p className="text-xs text-on-surface-variant">
          {medicine.latestCostPrice !== null
            ? `${formatCurrency(medicine.latestCostPrice, locale)} ${text.buy}`
            : `${text.notAvailable} ${text.buy}`}
        </p>
        <p className="text-xs text-on-surface-variant">
          {medicine.latestSellingPrice !== null
            ? `${formatCurrency(medicine.latestSellingPrice, locale)} ${text.sell}`
            : `${text.notAvailable} ${text.sell}`}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <StatusChip medicine={medicine} text={text} />
      </td>

      <td className="px-4 py-4 align-top">
        {canEdit ? (
          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Link
              href={`/medicines/adjust?medicineId=${medicine.id}`}
              title={text.receiveStock}
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
              title={text.adjustStock}
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
            <Link
              href={`/medicines/counts?medicineId=${medicine.id}`}
              title={text.runStockCount}
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
                <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
            </Link>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function StatusChip({
  medicine,
  text,
}: {
  medicine: InventoryMedicineSummary;
  text: (typeof MEDICINES_COPY)["en"];
}) {
  let label: string = text.stable;
  let tone: "success" | "warning" | "danger" | "neutral" = "success";

  if (!medicine.isActive) {
    label = text.inactive;
    tone = "danger";
  } else if (medicine.totalQuantityOnHand === 0) {
    label = text.outOfStock;
    tone = "danger";
  } else if (medicine.isLowStock && medicine.isExpiringSoon) {
    label = text.lowAndExpiry;
    tone = "warning";
  } else if (medicine.isLowStock) {
    label = text.lowStock;
    tone = "danger";
  } else if (medicine.isExpiringSoon) {
    label = text.nearExpiry;
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

function describeExpiry(
  value: string,
  locale: "en" | "am" | "om",
  text: (typeof MEDICINES_COPY)["en"]
) {
  const diffInDays = Math.ceil(
    (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays < 0) {
    return text.alreadyExpired;
  }

  if (diffInDays === 0) {
    return text.expiresToday;
  }

  if (diffInDays === 1) {
    return text.oneDayRemaining;
  }

  return text.daysRemaining.replace("{count}", formatNumber(diffInDays, locale));
}

function getStatusLabel(
  value: string,
  text: (typeof MEDICINES_COPY)["en"]
) {
  if (value === "Low Stock") {
    return text.lowStock;
  }

  if (value === "Near Expiry") {
    return text.nearExpiry;
  }

  if (value === "Stable") {
    return text.stable;
  }

  if (value === "Inactive") {
    return text.inactive;
  }

  return text.all;
}

const MEDICINES_COPY = {
  en: {
    loadingInventory: "Loading inventory…",
    defaultBranch: "your main branch",
    inventoryIntelligence: "Inventory Intelligence",
    inventoryDescription:
      "Track live stock by batch, expiry window, and retail value for {branch}.",
    restockOrders: "Restock Orders",
    stockCount: "Stock Count",
    adjustStock: "Adjust Stock",
    receiveStock: "Receive Stock",
    totalStockValue: "Total Stock Value",
    unitsOnHand: "units on hand",
    medicinesAtRisk: "Medicines At Risk",
    lowStockLower: "low stock",
    expiringBatches: "expiring batches",
    nearExpiryThirtyDays: "Near Expiry (30d)",
    closeReview: "Batches requiring close review",
    activeBatches: "Active Batches",
    catalogMedicines: "catalog medicines",
    searchPlaceholder: "Search medicines, generic names, or batch numbers…",
    category: "Category",
    status: "Status",
    all: "All",
    showing: "Showing",
    of: "of",
    items: "items",
    noMedicinesTitle: "No medicines in inventory yet",
    noMedicinesDescription:
      "Receive your first stock batch to create a live inventory record with expiry and quantity tracking.",
    noResultsTitle: "No results for \"{query}\"",
    noResultsDescription:
      "Try a different medicine name, generic, batch number, or category.",
    brandName: "Brand Name",
    genericName: "Generic Name",
    latestBatch: "Latest Batch",
    nextExpiry: "Next Expiry",
    stock: "Stock",
    priceEtb: "Price (ETB)",
    actions: "Actions",
    catalogItem: "Catalog item",
    notAvailable: "—",
    activeBatchesLower: "active batches",
    buy: "buy",
    sell: "sell",
    stable: "Stable",
    inactive: "Inactive",
    outOfStock: "Out of Stock",
    lowAndExpiry: "Low + Expiry",
    lowStock: "Low Stock",
    nearExpiry: "Near Expiry",
    runStockCount: "Run stock count",
    alreadyExpired: "Already expired",
    expiresToday: "Expires today",
    oneDayRemaining: "1 day remaining",
    daysRemaining: "{count} days remaining",
  },
  am: {
    loadingInventory: "እቃ በመጫን ላይ…",
    defaultBranch: "ዋና ቅርንጫፍዎ",
    inventoryIntelligence: "የእቃ ቁጥጥር ማዕከል",
    inventoryDescription:
      "ለ {branch} ቀጥታ እቃን በባች፣ በማብቂያ መስኮት እና በመሸጫ ዋጋ ይከታተሉ።",
    restockOrders: "የእንደገና ማስገቢያ ትዕዛዞች",
    stockCount: "የእቃ ቆጠራ",
    adjustStock: "እቃ አስተካክል",
    receiveStock: "እቃ ተቀበል",
    totalStockValue: "ጠቅላላ የእቃ ዋጋ",
    unitsOnHand: "በእጅ ያሉ ዩኒቶች",
    medicinesAtRisk: "አደጋ ላይ ያሉ መድሃኒቶች",
    lowStockLower: "ዝቅተኛ እቃ",
    expiringBatches: "የሚያልቁ ባቾች",
    nearExpiryThirtyDays: "በቅርብ ማብቂያ (30ቀ)",
    closeReview: "በቅርብ ክትትል የሚፈልጉ ባቾች",
    activeBatches: "ንቁ ባቾች",
    catalogMedicines: "የካታሎግ መድሃኒቶች",
    searchPlaceholder: "መድሃኒቶችን፣ ጄኔሪክ ስሞችን ወይም ባች ቁጥሮችን ይፈልጉ…",
    category: "ምድብ",
    status: "ሁኔታ",
    all: "ሁሉም",
    showing: "የሚታዩት",
    of: "ከ",
    items: "እቃዎች",
    noMedicinesTitle: "በእቃ ውስጥ መድሃኒት እስካሁን የለም",
    noMedicinesDescription:
      "በማብቂያ እና በብዛት ክትትል ያለው ቀጥታ የእቃ መዝገብ ለመፍጠር የመጀመሪያውን ባች ይቀበሉ።",
    noResultsTitle: "\"{query}\" ለሚለው ውጤት አልተገኘም",
    noResultsDescription:
      "ሌላ የመድሃኒት ስም፣ ጄኔሪክ፣ ባች ቁጥር ወይም ምድብ ይሞክሩ።",
    brandName: "የብራንድ ስም",
    genericName: "ጄኔሪክ ስም",
    latestBatch: "የቅርብ ባች",
    nextExpiry: "ቀጣይ ማብቂያ",
    stock: "እቃ",
    priceEtb: "ዋጋ (ETB)",
    actions: "እርምጃዎች",
    catalogItem: "የካታሎግ እቃ",
    notAvailable: "—",
    activeBatchesLower: "ንቁ ባቾች",
    buy: "ግዢ",
    sell: "ሽያጭ",
    stable: "የተረጋጋ",
    inactive: "ንቁ ያልሆነ",
    outOfStock: "እቃ የለም",
    lowAndExpiry: "ዝቅተኛ + ማብቂያ",
    lowStock: "ዝቅተኛ እቃ",
    nearExpiry: "በቅርብ ማብቂያ",
    runStockCount: "የእቃ ቆጠራ አሂድ",
    alreadyExpired: "አስቀድሞ አልቋል",
    expiresToday: "ዛሬ ያልቃል",
    oneDayRemaining: "1 ቀን ቀርቷል",
    daysRemaining: "{count} ቀናት ቀርተዋል",
  },
  om: {
    loadingInventory: "Kuusaan fe'amaa jira…",
    defaultBranch: "damee keessan isa guddaa",
    inventoryIntelligence: "Hubannoo Kuusaa",
    inventoryDescription:
      "Kuusaa yeroo ammaa baachiidhaan, yeroo xumuramuun, fi gatii gurgurtaatiin {branch}f hordofi.",
    restockOrders: "Ajajoota Deebisanii Guutuu",
    stockCount: "Lakkoofsa Kuusaa",
    adjustStock: "Kuusaa Sirreessi",
    receiveStock: "Kuusaa Fudhadhu",
    totalStockValue: "Gatii Kuusaa Waliigalaa",
    unitsOnHand: "yuunitii harkatti jiran",
    medicinesAtRisk: "Qorichoota Balaa Keessa Jiran",
    lowStockLower: "kuusaa gadi aanaa",
    expiringBatches: "baachiiwwan xumuramaa jiran",
    nearExpiryThirtyDays: "Xumuramuu Dhiyaataa (30g)",
    closeReview: "Baachiiwwan ilaalcha dhihoo barbaadan",
    activeBatches: "Baachiiwwan Hojii Irra Jiran",
    catalogMedicines: "qorichoota kaataalogii",
    searchPlaceholder: "Qorichoota, maqaa generic, yookaan lakkoofsa baachii barbaadi…",
    category: "Gosa",
    status: "Haala",
    all: "Hunda",
    showing: "Kan agarsiifamu",
    of: " keessaa",
    items: "meeshaalee",
    noMedicinesTitle: "Ammaaf kuusaa keessatti qorichi hin jiru",
    noMedicinesDescription:
      "Galmee kuusaa yeroo ammaa xumuramuu fi baay'inaan hordofu uumuuf baachii kuusaa keessan isa jalqabaa fudhadhaa.",
    noResultsTitle: "\"{query}\"f bu'aan hin argamne",
    noResultsDescription:
      "Maqaa qorichaa, generic, lakkoofsa baachii yookaan gosa biraa yaali.",
    brandName: "Maqaa Biraandii",
    genericName: "Maqaa Generic",
    latestBatch: "Baachii Haaraa",
    nextExpiry: "Xumuramuu Itti Aanu",
    stock: "Kuusaa",
    priceEtb: "Gatii (ETB)",
    actions: "Tarkaanfiiwwan",
    catalogItem: "Meeshaa kaataalogii",
    notAvailable: "—",
    activeBatchesLower: "baachiiwwan hojii irra jiran",
    buy: "bitaa",
    sell: "gurguri",
    stable: "Tasgabbaa'aa",
    inactive: "Hojii ala",
    outOfStock: "Kuusaan dhumeera",
    lowAndExpiry: "Gadi aanaa + xumuramuu",
    lowStock: "Kuusaa Gadi Aanaa",
    nearExpiry: "Xumuramuu Dhiyaataa",
    runStockCount: "Lakkoofsa kuusaa hojjechiisi",
    alreadyExpired: "Duraan xumurameera",
    expiresToday: "Har'a xumura",
    oneDayRemaining: "Guyyaan 1 hafeera",
    daysRemaining: "Guyyoonni {count} hafaniiru",
  },
} as const;
