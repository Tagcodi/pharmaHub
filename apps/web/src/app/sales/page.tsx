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
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from "../i18n/format";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type CreateSaleResponse,
  type SalesCatalogResponse,
  type SalesReconciliationResponse,
  type SalesOverviewResponse,
  type SessionResponse,
  type VoidSaleResponse,
} from "../lib/api";

const PAYMENT_METHODS = [
  { value: "CASH", icon: "💵" },
  { value: "CARD", icon: "💳" },
  { value: "MOBILE_MONEY", icon: "📱" },
  { value: "BANK_TRANSFER", icon: "🏦" },
] as const;

const RECONCILIATION_RANGES = [1, 7] as const;

type RightTab = "cart" | "void" | "reconciliation";

type CartItem = SalesCatalogResponse["medicines"][number] & {
  quantity: number;
};

export default function SalesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = SALES_COPY[locale] as (typeof SALES_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<SalesCatalogResponse | null>(null);
  const [overview, setOverview] = useState<SalesOverviewResponse | null>(null);
  const [reconciliation, setReconciliation] =
    useState<SalesReconciliationResponse | null>(null);
  const [reconciliationRange, setReconciliationRange] =
    useState<(typeof RECONCILIATION_RANGES)[number]>(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>("cart");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("Dispensing mistake");
  const [voidNotes, setVoidNotes] = useState("");
  const [receipt, setReceipt] = useState<CreateSaleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingReconciliation, setIsRefreshingReconciliation] =
    useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      setSession(sessionData);
      await refreshWorkspace(token, reconciliationRange, sessionData.user.role);
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

  async function refreshWorkspace(
    token: string,
    rangeDays = reconciliationRange,
    role = session?.user.role
  ) {
    const [catalogData, overviewData] = await Promise.all([
      fetchJson<SalesCatalogResponse>("/sales/catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<SalesOverviewResponse>("/sales/overview", {
        headers: getAuthHeaders(token),
      }),
    ]);

    setCatalog(catalogData);
    setOverview(overviewData);

    if (role !== "CASHIER") {
      const reconciliationData = await fetchJson<SalesReconciliationResponse>(
        `/sales/reconciliation?rangeDays=${rangeDays}`,
        { headers: getAuthHeaders(token) }
      );
      setReconciliation(reconciliationData);
      setReconciliationRange(rangeDays);
    } else {
      setReconciliation(null);
    }
  }

  async function loadReconciliation(
    rangeDays: (typeof RECONCILIATION_RANGES)[number]
  ) {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsRefreshingReconciliation(true);

    try {
      const reconciliationData = await fetchJson<SalesReconciliationResponse>(
        `/sales/reconciliation?rangeDays=${rangeDays}`,
        { headers: getAuthHeaders(token) }
      );
      setReconciliation(reconciliationData);
      setReconciliationRange(rangeDays);
      setError(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsRefreshingReconciliation(false);
    }
  }

  function addToCart(medicine: SalesCatalogResponse["medicines"][number]) {
    setCart((current) => {
      const existing = current.find((item) => item.id === medicine.id);

      if (existing) {
        return current.map((item) =>
          item.id === medicine.id
            ? {
                ...item,
                quantity: Math.min(
                  item.quantity + 1,
                  item.totalQuantityOnHand
                ),
              }
            : item
        );
      }

      return [...current, { ...medicine, quantity: 1 }];
    });

    setRightTab("cart");
  }

  function updateQuantity(medicineId: string, nextQuantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === medicineId
            ? {
                ...item,
                quantity: Math.max(
                  0,
                  Math.min(nextQuantity, item.totalQuantityOnHand)
                ),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  async function completeSale() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (cart.length === 0) {
      setError(text.addMedicineBeforeCheckout);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sale = await fetchJson<CreateSaleResponse>("/sales", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          paymentMethod,
          items: cart.map((item) => ({
            medicineId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      setReceipt(sale);
      setCart([]);
      setSuccessMessage(
        text.saleCompletedMessage
          .replace("{saleNumber}", sale.saleNumber)
          .replace("{amount}", formatCurrency(sale.totalAmount, locale))
      );
      await refreshWorkspace(token, reconciliationRange);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVoidSale() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!selectedSaleId) {
      setError(text.selectSaleBeforeVoiding);
      return;
    }

    if (!voidReason.trim()) {
      setError(text.voidReasonRequired);
      return;
    }

    setIsVoiding(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<VoidSaleResponse>(
        `/sales/${selectedSaleId}/void`,
        {
          method: "PATCH",
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            reason: voidReason,
            notes: voidNotes.trim() || undefined,
          }),
        }
      );

      setSelectedSaleId(null);
      setVoidNotes("");
      const totalRestored = result.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      setSuccessMessage(
        `${text.saleVoidedMessage
          .replace("{saleNumber}", result.saleNumber)
          .replace("{units}", formatNumber(totalRestored, locale))}${
          result.prescription
            ? ` ${text.prescriptionReopenedMessage.replace(
                "{number}",
                result.prescription.prescriptionNumber
              )}`
            : ""
        }`
      );
      setRightTab("cart");
      await refreshWorkspace(token, reconciliationRange);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsVoiding(false);
    }
  }

  const categories = useMemo(() => {
    const all = catalog?.medicines.map((m) => m.category).filter(Boolean) ?? [];
    return [...new Set(all)] as string[];
  }, [catalog?.medicines]);

  const filteredMedicines = useMemo(() => {
    const medicines = catalog?.medicines ?? [];
    const query = search.trim().toLowerCase();

    return medicines.filter((medicine) => {
      const matchesQuery =
        !query ||
        medicine.name.toLowerCase().includes(query) ||
        (medicine.genericName ?? "").toLowerCase().includes(query) ||
        (medicine.brandName ?? "").toLowerCase().includes(query) ||
        (medicine.currentBatchNumber ?? "").toLowerCase().includes(query);

      const matchesCategory =
        !categoryFilter || medicine.category === categoryFilter;

      return matchesQuery && matchesCategory;
    });
  }, [catalog?.medicines, search, categoryFilter]);

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.quantity * item.currentSellingPrice,
      0
    );

    return {
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      lineCount: cart.length,
      subtotal,
    };
  }, [cart]);

  const selectedSale =
    overview?.recentSales.find((sale) => sale.id === selectedSaleId) ?? null;

  const isOwnerOrPharmacist = session?.user.role !== "CASHIER";

  if (isLoading) {
    return <AppLoading message={text.loadingPosWorkspace} />;
  }

  if (!session) {
    return null;
  }

  const branchName =
    catalog?.branch.name ?? session.branch?.name ?? text.thisBranch;

  const rightTabs: { key: RightTab; label: string }[] = [
    { key: "cart", label: `${text.cart}${cartTotals.lineCount > 0 ? ` (${formatNumber(cartTotals.lineCount, locale)})` : ""}` },
    ...(isOwnerOrPharmacist
      ? [
          { key: "void" as RightTab, label: text.voidSale },
          { key: "reconciliation" as RightTab, label: text.reconciliation },
        ]
      : []),
  ];

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
        {/* Page header */}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
              {text.salesPos}
            </p>
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {text.pointOfSale}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {text.liveStockFrom}{" "}
              <span className="font-semibold text-primary">{branchName}</span>{" "}
              {text.batchDeductionAutomatic}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {receipt ? (
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="flex h-9 items-center gap-2 rounded-lg bg-secondary-container px-4 text-xs font-bold text-on-secondary-container transition-opacity hover:opacity-80"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {text.viewLastReceipt}
              </button>
            ) : null}
          </div>
        </div>

        {/* KPI strip */}
        <div className="mb-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={text.todaysRevenue}
            value={`ETB ${formatCurrency(overview?.metrics.todaySalesAmount ?? 0, locale)}`}
            note={
              <span>
                <span className="font-semibold text-primary">
                  {formatNumber(overview?.metrics.todaySalesCount ?? 0, locale)}
                </span>{" "}
                {text.completedTicketsToday}
              </span>
            }
            icon={
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
                </svg>
              </div>
            }
          />
          <KpiCard
            label={text.avgTicket}
            value={`ETB ${formatCurrency(overview?.metrics.averageTicket ?? 0, locale)}`}
            note={text.perCompletedSale}
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary-fixed/40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b5e45" strokeWidth="1.8">
                  <path d="M9 14l6-6m-.5 5.5a.5.5 0 11-.001-1 .5.5 0 01.001 1zm-5-5a.5.5 0 11-.001-1 .5.5 0 01.001 1z" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                </svg>
              </div>
            }
          />
          <KpiCard
            label={text.sellableMedicines}
            value={String(catalog?.medicines.length ?? 0)}
            note={text.inStockFor.replace("{branch}", branchName)}
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-container">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#386a20" strokeWidth="1.8">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
            }
          />
          <KpiCard
            label={text.cart}
            value={
              cartTotals.lineCount === 0
                ? text.empty
                : text.cartItemsLabel
                    .replace("{count}", formatNumber(cartTotals.lineCount, locale))
                    .replace("{suffix}", cartTotals.lineCount !== 1 ? text.pluralSuffix : "")
            }
            note={
              cartTotals.lineCount === 0
                ? text.tapPlusToAdd
                : `${formatNumber(cartTotals.itemCount, locale)} ${text.units} · ETB ${formatCurrency(cartTotals.subtotal, locale)}`
            }
            valueColor={cartTotals.lineCount === 0 ? "#70787d" : "#004253"}
            icon={
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${cartTotals.lineCount > 0 ? "bg-primary" : "bg-surface-low"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cartTotals.lineCount > 0 ? "white" : "#70787d"} strokeWidth="1.8">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.97-1.67L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            }
          />
        </div>

        {/* Feedback banners */}
        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-error-container px-4 py-3.5 text-sm text-on-error-container">
            <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto shrink-0 opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-secondary-container px-4 py-3.5 text-sm text-on-secondary-container">
            <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="ml-auto shrink-0 opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* Main two-column layout */}
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          {/* Left: Catalog + Recent Sales */}
          <div className="space-y-6">
            {/* Medicine catalog */}
            <SurfaceCard className="overflow-hidden">
              {/* Catalog toolbar */}
              <div
                className="flex flex-wrap items-center gap-3 px-6 py-4"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-outline">
                    {text.medicineCatalog}
                  </p>

                <div className="relative flex-1 min-w-[200px]">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline/50"
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    placeholder={text.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {search || categoryFilter ? (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setCategoryFilter(null); }}
                    className="text-xs font-semibold text-outline hover:text-on-surface transition-colors"
                  >
                    {text.clear}
                  </button>
                ) : null}
              </div>

              {/* Category filter chips */}
              {categories.length > 0 ? (
                <div
                  className="flex flex-wrap gap-2 px-6 py-3"
                  style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                >
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      categoryFilter === null
                        ? "bg-primary text-white"
                        : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
                    ].join(" ")}
                  >
                    {text.all}
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                        categoryFilter === cat
                          ? "bg-primary text-white"
                          : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
                      ].join(" ")}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Medicine list */}
              {(catalog?.medicines.length ?? 0) === 0 ? (
                <EmptyStateCard
                  title={text.noSellableInventory}
                  description={text.noSellableInventoryDescription}
                  icon={
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#70787d" strokeWidth="1.5">
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                    </svg>
                  }
                />
              ) : filteredMedicines.length === 0 ? (
                <EmptyStateCard
                  title={text.noResultsTitle.replace("{query}", search || categoryFilter || text.all)}
                  description={text.noResultsDescription}
                  icon={
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#70787d" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                    </svg>
                  }
                />
              ) : (
                <div className="divide-y divide-black/[0.04]">
                  {filteredMedicines.map((medicine) => {
                    const inCart = cart.find((c) => c.id === medicine.id);
                    return (
                      <div
                        key={medicine.id}
                        className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-surface-low"
                      >
                        {/* Medicine icon */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#004253" strokeWidth="1.8">
                            <path d="M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4z" />
                          </svg>
                        </div>

                        {/* Medicine info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-on-surface">
                              {medicine.name}
                            </p>
                            {medicine.isLowStock ? (
                              <StatusBadge label={text.low} tone="danger" />
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                            {[medicine.genericName, medicine.form, medicine.strength]
                              .filter(Boolean)
                              .join(" · ") || text.generalMedicine}
                          </p>
                        </div>

                        {/* Stock + price */}
                        <div className="hidden shrink-0 text-right sm:block">
                          <p className="text-sm font-bold text-on-surface">
                            ETB {formatCurrency(medicine.currentSellingPrice, locale)}
                          </p>
                          <p className="mt-0.5 text-xs text-on-surface-variant">
                            {formatNumber(medicine.totalQuantityOnHand, locale)} {text.inStock}
                          </p>
                        </div>

                        {/* Add to cart */}
                        {inCart ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(medicine.id, inCart.quantity - 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-high text-sm font-bold text-on-surface transition-colors hover:bg-surface-highest"
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-sm font-bold text-primary">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(medicine)}
                              disabled={inCart.quantity >= medicine.totalQuantityOnHand}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(medicine)}
                            disabled={medicine.totalQuantityOnHand === 0}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary/8 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/16 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {text.add}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredMedicines.length > 0 ? (
                <div
                  className="px-6 py-3 text-xs text-on-surface-variant"
                  style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                >
                  {text.showing} {formatNumber(filteredMedicines.length, locale)} {text.of} {formatNumber(catalog?.medicines.length ?? 0, locale)} {text.medicines}
                </div>
              ) : null}
            </SurfaceCard>

            {/* Recent Sales */}
            <SurfaceCard className="overflow-hidden">
              <div
                className="flex items-center justify-between gap-4 px-6 py-4"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <div>
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-outline">
                    {text.recentTransactions}
                  </p>
                </div>
                {overview?.recentSales.length ? (
                  <StatusBadge
                    label={`${formatNumber(overview.recentSales.length, locale)} ${text.records}`}
                    tone="neutral"
                  />
                ) : null}
              </div>

              {overview?.recentSales.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr
                        className="text-[0.63rem] font-bold uppercase tracking-[0.08em] text-outline"
                        style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                      >
                        <th className="px-6 py-3">{text.saleNo}</th>
                        <th className="px-3 py-3">{text.staff}</th>
                        <th className="px-3 py-3">{text.payment}</th>
                        <th className="px-3 py-3">{text.status}</th>
                        <th className="px-3 py-3 text-right">{text.amount}</th>
                        <th className="px-3 py-3 text-right">{text.time}</th>
                        {isOwnerOrPharmacist ? (
                          <th className="px-6 py-3 text-right">{text.action}</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="group transition-colors hover:bg-surface-low"
                          style={{ borderBottom: "1px solid rgba(0,66,83,0.04)" }}
                        >
                          <td className="px-6 py-3.5">
                            <p className="text-sm font-bold text-on-surface">
                              {sale.saleNumber}
                            </p>
                            <p className="mt-0.5 text-xs text-on-surface-variant">
                              {sale.items
                                .slice(0, 2)
                                .map((i) => `${i.medicineName} ×${i.quantity}`)
                                .join(", ")}
                              {sale.items.length > 2 ? ` +${sale.items.length - 2}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-sm text-on-surface-variant">
                            {sale.soldBy}
                          </td>
                          <td className="px-3 py-3.5">
                            <PaymentChip method={sale.paymentMethod} text={text} />
                          </td>
                          <td className="px-3 py-3.5">
                            <StatusBadge
                              label={sale.status === "VOIDED" ? text.voided : text.completed}
                              tone={sale.status === "VOIDED" ? "warning" : "success"}
                            />
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <p className="text-sm font-bold text-on-surface">
                              ETB {formatCurrency(sale.totalAmount, locale)}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-right text-xs text-on-surface-variant">
                            {formatRelativeTime(
                              sale.status === "VOIDED" && sale.voidedAt
                                ? sale.voidedAt
                                : sale.soldAt,
                              locale
                            )}
                          </td>
                          {isOwnerOrPharmacist ? (
                            <td className="px-6 py-3.5 text-right">
                              {sale.status === "COMPLETED" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSaleId(sale.id);
                                    setVoidReason(text.defaultVoidReason);
                                    setRightTab("void");
                                  }}
                                  className="rounded-full bg-error-container px-3 py-1 text-xs font-bold text-on-error-container transition-opacity hover:opacity-80"
                                >
                                  {text.void}
                                </button>
                              ) : (
                                <span className="text-xs text-on-surface-variant">
                                  {sale.voidReason ?? text.reversed}
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noSalesRecorded}
                  description={text.noSalesRecordedDescription}
                />
              )}
            </SurfaceCard>
          </div>

          {/* Right panel with tabs */}
          <div className="space-y-6">
            <SurfaceCard className="overflow-hidden">
              {/* Tab bar */}
              <div
                className="flex"
                style={{ borderBottom: "2px solid rgba(0,66,83,0.06)" }}
              >
                {rightTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRightTab(tab.key)}
                    className={[
                      "flex-1 py-3.5 text-xs font-bold uppercase tracking-[0.07em] transition-colors",
                      rightTab === tab.key
                        ? "border-b-2 border-primary text-primary"
                        : "text-outline hover:text-on-surface",
                    ].join(" ")}
                    style={
                      rightTab === tab.key
                        ? { marginBottom: "-2px" }
                        : undefined
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Cart tab */}
              {rightTab === "cart" ? (
                <div className="p-5">
                  {/* Cart items */}
                  <div className="space-y-2">
                    {cart.length === 0 ? (
                      <div className="py-6">
                        <EmptyStateCard
                          compact
                          title={text.cartIsEmpty}
                          description={text.cartIsEmptyDescription}
                        />
                      </div>
                    ) : (
                      cart.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl bg-surface-low p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-on-surface">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-xs text-on-surface-variant">
                                {text.batch} {item.currentBatchNumber ?? text.notAvailable} · ETB{" "}
                                {formatCurrency(item.currentSellingPrice, locale)}{" "}
                                {text.each}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, 0)}
                              className="shrink-0 text-[0.7rem] font-bold text-outline transition-colors hover:text-on-error-container"
                            >
                              {text.remove}
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <QuantityButton
                                onClick={() =>
                                  updateQuantity(item.id, item.quantity - 1)
                                }
                              >
                                −
                              </QuantityButton>
                              <span className="w-8 text-center text-sm font-bold text-on-surface">
                                {item.quantity}
                              </span>
                              <QuantityButton
                                onClick={() =>
                                  updateQuantity(item.id, item.quantity + 1)
                                }
                                disabled={
                                  item.quantity >= item.totalQuantityOnHand
                                }
                              >
                                +
                              </QuantityButton>
                            </div>
                            <span className="text-sm font-bold text-on-surface">
                              ETB{" "}
                              {formatCurrency(
                                item.quantity * item.currentSellingPrice
                              , locale)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Payment method */}
                  <div className="mt-5">
                    <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline">
                      {text.paymentMethod}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => setPaymentMethod(method.value)}
                          className={[
                            "flex flex-col items-center gap-1 rounded-xl py-3 text-center transition-all",
                            paymentMethod === method.value
                              ? "bg-primary text-white shadow-[0_4px_12px_rgba(0,66,83,0.25)]"
                              : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
                          ].join(" ")}
                        >
                          <span className="text-base">{method.icon}</span>
                          <span className="text-[0.6rem] font-bold uppercase tracking-[0.05em]">
                            {getPaymentLabel(method.value, text)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order summary */}
                  {cart.length > 0 ? (
                    <div className="mt-5 rounded-xl bg-surface-low p-4">
                      <SummaryRow
                        label={text.lineItems}
                        value={formatNumber(cartTotals.lineCount, locale)}
                      />
                      <div className="my-2" style={{ borderTop: "1px solid rgba(0,66,83,0.08)" }} />
                      <SummaryRow
                        label={text.totalUnits}
                        value={formatNumber(cartTotals.itemCount, locale)}
                      />
                      <div className="my-2" style={{ borderTop: "1px solid rgba(0,66,83,0.08)" }} />
                      <SummaryRow
                        label={text.subtotal}
                        value={`ETB ${formatCurrency(cartTotals.subtotal, locale)}`}
                        bold
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void completeSale()}
                    disabled={isSubmitting || cart.length === 0}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background:
                        cart.length === 0
                          ? "#b0bec5"
                          : "linear-gradient(135deg, #004253, #005b71)",
                      boxShadow:
                        cart.length > 0
                          ? "0 4px 16px rgba(0,66,83,0.30)"
                          : "none",
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                        {text.processing}
                      </>
                    ) : (
                      <>
                        {text.completeSale}
                        {cart.length > 0 ? (
                          <span className="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-xs">
                            ETB {formatCurrency(cartTotals.subtotal, locale)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                </div>
              ) : null}

              {/* Void tab */}
              {rightTab === "void" && isOwnerOrPharmacist ? (
                <div className="p-5">
                  <p className="mb-4 text-sm text-on-surface-variant">
                    {text.selectCompletedSaleDescription}
                  </p>

                  {selectedSale ? (
                    <div className="space-y-4">
                      {/* Selected sale preview */}
                      <div className="rounded-xl bg-surface-low p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-on-surface">
                              {selectedSale.saleNumber}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {selectedSale.soldBy} · ETB{" "}
                              {formatCurrency(selectedSale.totalAmount, locale)} ·{" "}
                              {formatNumber(selectedSale.itemCount, locale)} {text.unit}
                              {selectedSale.itemCount !== 1 ? text.pluralSuffix : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedSaleId(null)}
                            className="text-xs font-semibold text-outline hover:text-on-surface"
                          >
                            {text.change}
                          </button>
                        </div>
                      </div>

                      {/* Reason */}
                      <div>
                        <label className="mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline">
                          {text.voidReason} <span className="text-on-error-container">*</span>
                        </label>
                        <input
                          value={voidReason}
                          onChange={(e) => setVoidReason(e.target.value)}
                          className="h-11 w-full rounded-xl bg-surface-low px-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder={text.voidReasonPlaceholder}
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline">
                          {text.notes}{" "}
                          <span className="font-normal normal-case text-on-surface-variant">
                            ({text.optional})
                          </span>
                        </label>
                        <textarea
                          value={voidNotes}
                          onChange={(e) => setVoidNotes(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl bg-surface-low px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder={text.auditTrailContext}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleVoidSale()}
                        disabled={isVoiding || !voidReason.trim()}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-error-container text-sm font-bold text-on-error-container transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isVoiding ? (
                          <>
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            {text.voiding}
                          </>
                        ) : (
                          text.voidSelectedSale
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-surface-low p-6 text-center">
                      <svg className="mx-auto mb-3 text-outline/40" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 14l6-6" strokeLinecap="round" />
                        <circle cx="9.5" cy="9.5" r=".5" fill="currentColor" />
                        <circle cx="14.5" cy="14.5" r=".5" fill="currentColor" />
                        <rect x="3" y="6" width="18" height="13" rx="2" />
                        <path d="M3 10h18" strokeLinecap="round" />
                      </svg>
                      <p className="text-sm font-semibold text-on-surface-variant">
                        {text.noSaleSelected}
                      </p>
                      <p className="mt-1 text-xs text-outline">
                        {text.clickThe}{" "}
                        <span className="font-bold text-on-error-container">
                          {text.void}
                        </span>{" "}
                        {text.buttonNextToCompletedTransaction}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Reconciliation tab */}
              {rightTab === "reconciliation" && isOwnerOrPharmacist ? (
                <div className="p-5">
                  {reconciliation ? (
                    <>
                      {/* Range selector */}
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <p className="text-xs text-on-surface-variant">
                          {reconciliation.range.startDate} –{" "}
                          {reconciliation.range.endDate}
                        </p>
                        <div className="flex rounded-full bg-surface-low p-1">
                          {RECONCILIATION_RANGES.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => void loadReconciliation(option)}
                              disabled={isRefreshingReconciliation}
                              className={[
                                "rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.06em] transition-colors",
                                reconciliationRange === option
                                  ? "bg-primary text-white"
                                  : "text-on-surface-variant hover:text-on-surface",
                              ].join(" ")}
                            >
                              {option === 1 ? text.today : `${option}d`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sales stat grid */}
                      <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                        {text.sales}
                      </p>
                      <div className="mb-5 grid grid-cols-2 gap-2">
                        <ReconStat
                          label={text.netRevenue}
                          value={`ETB ${formatCurrency(reconciliation.totals.netSalesAmount, locale)}`}
                          tone="primary"
                        />
                        <ReconStat
                          label={text.grossSales}
                          value={`ETB ${formatCurrency(reconciliation.totals.grossSalesAmount, locale)}`}
                        />
                        <ReconStat
                          label={text.completed}
                          value={formatNumber(reconciliation.totals.completedSalesCount, locale)}
                        />
                        <ReconStat
                          label={text.voided}
                          value={`${formatNumber(reconciliation.totals.voidedSalesCount, locale)} · ETB ${formatCurrency(reconciliation.totals.voidedSalesAmount, locale)}`}
                          tone={reconciliation.totals.voidedSalesCount > 0 ? "warning" : "neutral"}
                        />
                      </div>

                      {/* Stock movement */}
                      <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                        {text.stockMovement}
                      </p>
                      <div className="mb-5 grid grid-cols-2 gap-2">
                        <ReconStat label={text.openingUnits} value={formatNumber(reconciliation.totals.openingUnitsOnHand, locale)} />
                        <ReconStat label={text.closingUnits} value={formatNumber(reconciliation.totals.closingUnitsOnHand, locale)} />
                        <ReconStat label={text.stockIn} value={`+${formatNumber(reconciliation.totals.stockInUnits, locale)}`} tone="success" />
                        <ReconStat label={text.sold} value={`−${formatNumber(reconciliation.totals.saleUnits, locale)}`} />
                        <ReconStat label={text.restored} value={`+${formatNumber(reconciliation.totals.voidRestorationUnits, locale)}`} />
                        <ReconStat
                          label={text.suspectedLoss}
                          value={formatNumber(reconciliation.totals.suspectedLossCount, locale)}
                          tone={reconciliation.totals.suspectedLossCount > 0 ? "danger" : "neutral"}
                        />
                      </div>

                      {/* Recent voids */}
                      {reconciliation.recentVoids.length > 0 ? (
                        <>
                          <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                            {text.recentVoids}
                          </p>
                          <div className="space-y-2">
                            {reconciliation.recentVoids.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl bg-surface-low p-3.5"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-bold text-on-surface">
                                    {item.saleNumber}
                                  </p>
                                  <StatusBadge label={text.voided} tone="warning" />
                                </div>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  {item.voidedBy} · {item.reason}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-on-surface">
                                  ETB {formatCurrency(item.totalAmount, locale)} ·{" "}
                                  {formatNumber(item.itemCount, locale)} {text.unit}{item.itemCount !== 1 ? text.pluralSuffix : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <div className="py-6 text-center">
                      {isRefreshingReconciliation ? (
                        <p className="text-sm text-on-surface-variant">
                          {text.loadingReconciliation}
                        </p>
                      ) : (
                        <EmptyStateCard
                          compact
                          title={text.noReconciliationData}
                          description={text.noReconciliationDescription}
                        />
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </SurfaceCard>

            {/* Last receipt */}
            {receipt ? (
              <SurfaceCard className="overflow-hidden">
                <div
                  className="flex items-center justify-between gap-4 px-6 py-4"
                  style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
                >
                  <div>
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-outline">
                      {text.lastReceipt}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-on-surface">
                      {receipt.saleNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-on-surface-variant">
                      {formatDateTime(receipt.soldAt, locale)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-on-surface-variant">
                      {formatPaymentMethod(receipt.paymentMethod, text)}
                    </p>
                  </div>
                </div>

                <div className="p-5 space-y-2">
                  {receipt.items.map((item, index) => (
                    <div
                      key={`${item.medicineId}-${item.batchNumber}-${index}`}
                      className="flex items-start justify-between gap-4"
                      style={
                        index > 0
                          ? { paddingTop: "0.5rem", borderTop: "1px solid rgba(0,66,83,0.06)" }
                          : undefined
                      }
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {item.medicineName}
                        </p>
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                          {text.batch} {item.batchNumber} · {formatNumber(item.quantity, locale)} × ETB{" "}
                          {formatCurrency(item.unitPrice, locale)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-on-surface">
                        ETB {formatCurrency(item.lineTotal, locale)}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{
                    background: "linear-gradient(135deg, #004253, #005b71)",
                  }}
                >
                  <p className="text-sm font-bold text-white/80">{text.total}</p>
                  <p className="text-lg font-bold text-white">
                    ETB {formatCurrency(receipt.totalAmount, locale)}
                  </p>
                </div>
              </SurfaceCard>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function QuantityButton({
  children,
  onClick,
  disabled,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-high text-sm font-bold text-on-surface transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm ${bold ? "font-bold text-on-surface" : "text-on-surface-variant"}`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? "text-lg font-extrabold text-primary" : "font-semibold text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}

function ReconStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
}) {
  const valueColor =
    tone === "primary"
      ? "#004253"
      : tone === "success"
        ? "#386a20"
        : tone === "warning"
          ? "#6b5e45"
          : tone === "danger"
            ? "#ba1a1a"
            : "#191c1e";

  return (
    <div className="rounded-xl bg-surface-low p-3">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.07em] text-outline">
        {label}
      </p>
      <p
        className="mt-1 text-sm font-bold leading-snug"
        style={{ color: valueColor }}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentChip({
  method,
  text,
}: {
  method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER";
  text: (typeof SALES_COPY)["en"];
}) {
  const map = {
    CASH: { label: text.cash, bg: "bg-secondary-container", color: "text-on-secondary-container" },
    CARD: { label: text.card, bg: "bg-primary/8", color: "text-primary" },
    MOBILE_MONEY: { label: text.mobile, bg: "bg-tertiary-fixed/40", color: "text-on-tertiary-fixed-variant" },
    BANK_TRANSFER: { label: text.bank, bg: "bg-surface-high", color: "text-on-surface-variant" },
  };
  const { label, bg, color } = map[method];

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${bg} ${color}`}
    >
      {label}
    </span>
  );
}

function formatPaymentMethod(
  method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER",
  text: (typeof SALES_COPY)["en"]
) {
  return getPaymentLabel(method, text);
}

function getPaymentLabel(
  method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER",
  text: (typeof SALES_COPY)["en"]
) {
  if (method === "MOBILE_MONEY") {
    return text.mobile;
  }

  if (method === "BANK_TRANSFER") {
    return text.bank;
  }

  if (method === "CARD") {
    return text.card;
  }

  return text.cash;
}

const SALES_COPY = {
  en: {
    loadingPosWorkspace: "Loading POS workspace…",
    thisBranch: "this branch",
    addMedicineBeforeCheckout: "Add at least one medicine to the cart before checkout.",
    saleCompletedMessage: "Sale {saleNumber} completed — ETB {amount}.",
    selectSaleBeforeVoiding: "Select a completed sale before voiding it.",
    voidReasonRequired: "A void reason is required.",
    saleVoidedMessage: "Sale {saleNumber} voided. {units} units restored to stock.",
    prescriptionReopenedMessage:
      "Prescription {number} returned to READY for re-dispensing.",
    cart: "Cart",
    voidSale: "Void Sale",
    reconciliation: "Reconciliation",
    salesPos: "Sales / POS",
    pointOfSale: "Point of Sale",
    liveStockFrom: "Live stock from",
    batchDeductionAutomatic: "— batch deduction is automatic on every completed sale.",
    viewLastReceipt: "View Last Receipt",
    todaysRevenue: "Today's Revenue",
    completedTicketsToday: "completed tickets today",
    avgTicket: "Avg. Ticket",
    perCompletedSale: "Per completed sale",
    sellableMedicines: "Sellable Medicines",
    inStockFor: "In stock for {branch}",
    empty: "Empty",
    cartItemsLabel: "{count} item{suffix}",
    pluralSuffix: "s",
    tapPlusToAdd: "Tap + on a medicine to add",
    units: "units",
    medicineCatalog: "Medicine Catalog",
    searchPlaceholder: "Search by name, generic, or batch…",
    clear: "Clear",
    all: "All",
    noSellableInventory: "No sellable inventory yet",
    noSellableInventoryDescription:
      "Receive stock first so the POS can draw from real available batches.",
    noResultsTitle: "No results for \"{query}\"",
    noResultsDescription:
      "Try a different medicine name, generic, or batch reference.",
    low: "Low",
    generalMedicine: "General medicine",
    inStock: "in stock",
    add: "Add",
    showing: "Showing",
    of: "of",
    medicines: "medicines",
    recentTransactions: "Recent Transactions",
    records: "records",
    saleNo: "Sale No.",
    staff: "Staff",
    payment: "Payment",
    status: "Status",
    amount: "Amount",
    time: "Time",
    action: "Action",
    voided: "Voided",
    completed: "Completed",
    void: "Void",
    defaultVoidReason: "Dispensing mistake",
    reversed: "Reversed",
    noSalesRecorded: "No sales recorded yet",
    noSalesRecordedDescription:
      "The first completed POS transaction will appear here immediately.",
    cartIsEmpty: "Cart is empty",
    cartIsEmptyDescription:
      "Tap + next to a medicine to add it to the cart.",
    batch: "Batch",
    notAvailable: "—",
    each: "each",
    remove: "Remove",
    paymentMethod: "Payment Method",
    lineItems: "Line items",
    totalUnits: "Total units",
    subtotal: "Subtotal",
    processing: "Processing…",
    completeSale: "Complete Sale",
    selectCompletedSaleDescription:
      "Select a completed sale from the transaction table to reverse it with a documented reason.",
    unit: "unit",
    change: "Change",
    voidReason: "Void Reason",
    voidReasonPlaceholder: "e.g. Dispensing mistake",
    notes: "Notes",
    optional: "optional",
    auditTrailContext: "Add context for the audit trail.",
    voiding: "Voiding…",
    voidSelectedSale: "Void Selected Sale",
    noSaleSelected: "No sale selected",
    clickThe: "Click the",
    buttonNextToCompletedTransaction:
      "button next to a completed transaction in the table.",
    today: "Today",
    sales: "Sales",
    netRevenue: "Net Revenue",
    grossSales: "Gross Sales",
    stockMovement: "Stock Movement",
    openingUnits: "Opening Units",
    closingUnits: "Closing Units",
    stockIn: "Stock In",
    sold: "Sold",
    restored: "Restored",
    suspectedLoss: "Suspected Loss",
    recentVoids: "Recent Voids",
    loadingReconciliation: "Loading reconciliation…",
    noReconciliationData: "No reconciliation data",
    noReconciliationDescription:
      "Reconciliation is available to OWNER and PHARMACIST roles.",
    lastReceipt: "Last Receipt",
    total: "Total",
    cash: "Cash",
    card: "Card",
    mobile: "Mobile",
    bank: "Bank",
  },
  am: {
    loadingPosWorkspace: "የPOS ስራ ቦታ በመጫን ላይ…",
    thisBranch: "ይህ ቅርንጫፍ",
    addMedicineBeforeCheckout: "ከመክፈያ በፊት ቢያንስ አንድ መድሃኒት ወደ ጋሪው ያክሉ።",
    saleCompletedMessage: "ሽያጭ {saleNumber} ተጠናቋል — ETB {amount}።",
    selectSaleBeforeVoiding: "ከመሰረዝ በፊት የተጠናቀቀ ሽያጭ ይምረጡ።",
    voidReasonRequired: "የመሰረዝ ምክንያት ያስፈልጋል።",
    saleVoidedMessage: "ሽያጭ {saleNumber} ተሰርዟል። {units} ዩኒቶች ወደ እቃ ተመልሰዋል።",
    prescriptionReopenedMessage:
      "ትዕዛዝ {number} እንደገና ለመስጠት ወደ READY ተመልሷል።",
    cart: "ጋሪ",
    voidSale: "ሽያጭ ሰርዝ",
    reconciliation: "ማስታረቅ",
    salesPos: "ሽያጭ / POS",
    pointOfSale: "የሽያጭ ቦታ",
    liveStockFrom: "ቀጥታ እቃ ከ",
    batchDeductionAutomatic: "— በእያንዳንዱ የተጠናቀቀ ሽያጭ ላይ የባች ቅናሽ በራስ-ሰር ይደረጋል።",
    viewLastReceipt: "የመጨረሻውን ደረሰኝ እይ",
    todaysRevenue: "የዛሬ ገቢ",
    completedTicketsToday: "ዛሬ የተጠናቀቁ ቲኬቶች",
    avgTicket: "አማካይ ቲኬት",
    perCompletedSale: "በአንድ የተጠናቀቀ ሽያጭ",
    sellableMedicines: "ለሽያጭ የተዘጋጁ መድሃኒቶች",
    inStockFor: "{branch} ውስጥ በእቃ ያሉ",
    empty: "ባዶ",
    cartItemsLabel: "{count} እቃ{suffix}",
    pluralSuffix: "ዎች",
    tapPlusToAdd: "ለመጨመር + ይጫኑ",
    units: "ዩኒቶች",
    medicineCatalog: "የመድሃኒት ካታሎግ",
    searchPlaceholder: "በስም፣ ጄኔሪክ ወይም ባች ይፈልጉ…",
    clear: "አጥፋ",
    all: "ሁሉም",
    noSellableInventory: "ለሽያጭ የተዘጋጀ እቃ የለም",
    noSellableInventoryDescription:
      "POS ከእውነተኛ ያለ ባች እንዲወስድ መጀመሪያ እቃ ይቀበሉ።",
    noResultsTitle: "\"{query}\" ለሚለው ውጤት አልተገኘም",
    noResultsDescription: "ሌላ የመድሃኒት ስም፣ ጄኔሪክ ወይም ባች ማመሳከሪያ ይሞክሩ።",
    low: "ዝቅ",
    generalMedicine: "አጠቃላይ መድሃኒት",
    inStock: "በእቃ ያለ",
    add: "አክል",
    showing: "የሚታዩት",
    of: "ከ",
    medicines: "መድሃኒቶች",
    recentTransactions: "የቅርብ ግብይቶች",
    records: "መዝገቦች",
    saleNo: "የሽያጭ ቁጥር",
    staff: "ሰራተኛ",
    payment: "ክፍያ",
    status: "ሁኔታ",
    amount: "መጠን",
    time: "ጊዜ",
    action: "እርምጃ",
    voided: "ተሰርዟል",
    completed: "ተጠናቋል",
    void: "ሰርዝ",
    defaultVoidReason: "የማቅረብ ስህተት",
    reversed: "ተመልሷል",
    noSalesRecorded: "ሽያጭ እስካሁን አልተመዘገበም",
    noSalesRecordedDescription:
      "የመጀመሪያው የተጠናቀቀ POS ግብይት እዚህ ወዲያውኑ ይታያል።",
    cartIsEmpty: "ጋሪው ባዶ ነው",
    cartIsEmptyDescription: "ወደ ጋሪው ለመጨመር ከመድሃኒቱ አጠገብ + ይጫኑ።",
    batch: "ባች",
    notAvailable: "—",
    each: "እያንዳንዱ",
    remove: "አስወግድ",
    paymentMethod: "የክፍያ ዘዴ",
    lineItems: "የመስመር እቃዎች",
    totalUnits: "ጠቅላላ ዩኒቶች",
    subtotal: "ንዑስ ድምር",
    processing: "በሂደት ላይ…",
    completeSale: "ሽያጩን ጨርስ",
    selectCompletedSaleDescription:
      "በሰንጠረዡ ላይ ካለው የተጠናቀቀ ሽያጭ አንዱን ይምረጡ እና በተመዘገበ ምክንያት ይመልሱት።",
    unit: "ዩኒት",
    change: "ቀይር",
    voidReason: "የመሰረዝ ምክንያት",
    voidReasonPlaceholder: "ለምሳሌ የማቅረብ ስህተት",
    notes: "ማስታወሻዎች",
    optional: "አማራጭ",
    auditTrailContext: "ለኦዲት መዝገቡ አጭር መረጃ ያክሉ።",
    voiding: "በመሰረዝ ላይ…",
    voidSelectedSale: "የተመረጠውን ሽያጭ ሰርዝ",
    noSaleSelected: "ምንም ሽያጭ አልተመረጠም",
    clickThe: "በሰንጠረዡ ውስጥ ካለው የተጠናቀቀ ግብይት አጠገብ ያለውን",
    buttonNextToCompletedTransaction: "አዝራር ይጫኑ።",
    today: "ዛሬ",
    sales: "ሽያጭ",
    netRevenue: "የተጣራ ገቢ",
    grossSales: "ጠቅላላ ሽያጭ",
    stockMovement: "የእቃ እንቅስቃሴ",
    openingUnits: "የመክፈቻ ዩኒቶች",
    closingUnits: "የመዝጊያ ዩኒቶች",
    stockIn: "የገባ እቃ",
    sold: "የተሸጠ",
    restored: "የተመለሰ",
    suspectedLoss: "የተጠረጠረ ጉድለት",
    recentVoids: "የቅርብ ሰረዛዎች",
    loadingReconciliation: "ማስታረቅ በመጫን ላይ…",
    noReconciliationData: "የማስታረቅ መረጃ የለም",
    noReconciliationDescription: "ማስታረቅ ለ OWNER እና PHARMACIST ሚናዎች ብቻ ይገኛል።",
    lastReceipt: "የመጨረሻ ደረሰኝ",
    total: "ጠቅላላ",
    cash: "ጥሬ ገንዘብ",
    card: "ካርድ",
    mobile: "ሞባይል",
    bank: "ባንክ",
  },
  om: {
    loadingPosWorkspace: "Bakka hojii POS fe'amaa jira…",
    thisBranch: "damee kana",
    addMedicineBeforeCheckout: "Kaffaltii dura qoricha tokko xiqqaate gaarii keessa galchi.",
    saleCompletedMessage: "Gurgurtaan {saleNumber} xumurameera — ETB {amount}.",
    selectSaleBeforeVoiding: "Haqa dura gurgurtaa xumurame filadhu.",
    voidReasonRequired: "Sababni haqaa barbaachisaadha.",
    saleVoidedMessage: "Gurgurtaan {saleNumber} haqameera. Yuunitiin {units} gara kuusaa deebi'eera.",
    prescriptionReopenedMessage:
      "Ajajni {number} irra deebi'anii kennuuf gara READYtti deebi'eera.",
    cart: "Gaarii",
    voidSale: "Gurgurtaa Haqi",
    reconciliation: "Wal Simsiisuu",
    salesPos: "Gurgurtaa / POS",
    pointOfSale: "Bakka Gurgurtaa",
    liveStockFrom: "Kuusaan yeroo ammaa kan",
    batchDeductionAutomatic: "— baachiin gurgurtaa xumurame hundatti ofumaan hir'ata.",
    viewLastReceipt: "Ragaa Dhumaa Ilaali",
    todaysRevenue: "Galii Har'aa",
    completedTicketsToday: "tikettii har'a xumuraman",
    avgTicket: "Tikettii Giddugaleessaa",
    perCompletedSale: "Gurgurtaa xumurame tokkoof",
    sellableMedicines: "Qorichoota Gurguramoo",
    inStockFor: "{branch} keessatti kuusaa keessa",
    empty: "Duwwaa",
    cartItemsLabel: "meeshaa {count}{suffix}",
    pluralSuffix: "",
    tapPlusToAdd: "Dabalachuuf + cuqaasi",
    units: "yuunitii",
    medicineCatalog: "Kaataalogii Qorichaa",
    searchPlaceholder: "Maqaa, generic, yookaan baachii barbaadi…",
    clear: "Haqi",
    all: "Hunda",
    noSellableInventory: "Ammaaf kuusaan gurguramoo hin jiru",
    noSellableInventoryDescription:
      "POS baachii dhugaa irraa akka fayyadamuuf dura kuusaa fudhadhu.",
    noResultsTitle: "\"{query}\"f bu'aan hin argamne",
    noResultsDescription: "Maqaa qorichaa, generic, yookaan ragaa baachii biraa yaali.",
    low: "Gadi",
    generalMedicine: "Qoricha waliigalaa",
    inStock: "kuusaa keessa",
    add: "Dabali",
    showing: "Kan mul'atan",
    of: " keessaa",
    medicines: "qorichoota",
    recentTransactions: "Daldala Yeroo Dhihoo",
    records: "galmeewwan",
    saleNo: "Lakkoofsa Gurgurtaa",
    staff: "Hojjetaa",
    payment: "Kafaltii",
    status: "Haala",
    amount: "Hammamtaa",
    time: "Yeroo",
    action: "Tarkaanfii",
    voided: "Haqame",
    completed: "Xumurame",
    void: "Haqi",
    defaultVoidReason: "Dogoggora kenninsaa",
    reversed: "Deebi'eera",
    noSalesRecorded: "Ammaaf gurgurtaan hin galmoofne",
    noSalesRecordedDescription:
      "Daldalli POS xumurame inni jalqabaa as irratti battaluma mul'ata.",
    cartIsEmpty: "Gaariin duwwaa dha",
    cartIsEmptyDescription: "Gaarii keessatti dabalachuuf + cuqaasi.",
    batch: "Baachii",
    notAvailable: "—",
    each: "tokkoon tokkoon",
    remove: "Balleessi",
    paymentMethod: "Mala Kaffaltii",
    lineItems: "Meeshaalee sararaa",
    totalUnits: "Yuunitii waliigalaa",
    subtotal: "Walitti qabaa xiqqaa",
    processing: "Adeemsa keessa…",
    completeSale: "Gurgurtaa Xumuri",
    selectCompletedSaleDescription:
      "Gurgurtaa xumurame tokko filadhu, sababaa galmaa'een akka deebi'uuf.",
    unit: "yuunit",
    change: "Jijjiiri",
    voidReason: "Sababa Haqaa",
    voidReasonPlaceholder: "Fkn. dogoggora kenninsaa",
    notes: "Yaadannoo",
    optional: "dirqama miti",
    auditTrailContext: "Galmee odiitiif ibsa gabaabaa dabali.",
    voiding: "Haqamaa jira…",
    voidSelectedSale: "Gurgurtaa Filatame Haqi",
    noSaleSelected: "Gurgurtaan hin filatamne",
    clickThe: "Tarree keessatti daldala xumurame bira jiru",
    buttonNextToCompletedTransaction: "button cuqaasi.",
    today: "Har'a",
    sales: "Gurgurtaa",
    netRevenue: "Galii Saafaa",
    grossSales: "Gurgurtaa Waliigalaa",
    stockMovement: "Sochii Kuusaa",
    openingUnits: "Yuunitii Banuu",
    closingUnits: "Yuunitii Cufuu",
    stockIn: "Kuusaa Gale",
    sold: "Gurgurame",
    restored: "Deebi'e",
    suspectedLoss: "Badiinsa Shakkame",
    recentVoids: "Haqawwan Yeroo Dhihoo",
    loadingReconciliation: "Wal simsiisuun fe'amaa jira…",
    noReconciliationData: "Ragaan wal simsiisuu hin jiru",
    noReconciliationDescription:
      "Wal simsiisuun gahee OWNER fi PHARMACIST qofaaf jira.",
    lastReceipt: "Ragaa Dhumaa",
    total: "Waliigala",
    cash: "Maallaqa",
    card: "Kaardii",
    mobile: "Moobaayilaa",
    bank: "Baankii",
  },
} as const;
