"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type CreateSaleResponse,
  type SalesCatalogResponse,
  type SalesOverviewResponse,
  type SessionResponse,
} from "../lib/api";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
] as const;

type CartItem = SalesCatalogResponse["medicines"][number] & {
  quantity: number;
};

export default function SalesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<SalesCatalogResponse | null>(null);
  const [overview, setOverview] = useState<SalesOverviewResponse | null>(null);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [receipt, setReceipt] = useState<CreateSaleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setSession(sessionData);

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

  function addToCart(medicine: SalesCatalogResponse["medicines"][number]) {
    setCart((current) => {
      const existing = current.find((item) => item.id === medicine.id);

      if (existing) {
        return current.map((item) =>
          item.id === medicine.id
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, item.totalQuantityOnHand),
              }
            : item
        );
      }

      return [...current, { ...medicine, quantity: 1 }];
    });
  }

  function updateQuantity(medicineId: string, nextQuantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === medicineId
            ? {
                ...item,
                quantity: Math.max(0, Math.min(nextQuantity, item.totalQuantityOnHand)),
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
      setError("Add at least one medicine to the cart before checkout.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

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
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
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
        (medicine.brandName ?? "").toLowerCase().includes(query) ||
        (medicine.currentBatchNumber ?? "").toLowerCase().includes(query)
      );
    });
  }, [catalog?.medicines, search]);

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.quantity * item.currentSellingPrice,
      0
    );

    return {
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
    };
  }, [cart]);

  if (isLoading) {
    return <AppLoading message="Loading POS workspace…" />;
  }

  if (!session) {
    return null;
  }

  const branchName = catalog?.branch.name ?? session.branch?.name ?? "this branch";

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label="Today Sales"
            value={`ETB ${formatCurrency(overview?.metrics.todaySalesAmount ?? 0)}`}
            note={`${overview?.metrics.todaySalesCount ?? 0} completed tickets`}
          />
          <KpiCard
            label="Average Ticket"
            value={`ETB ${formatCurrency(overview?.metrics.averageTicket ?? 0)}`}
            note="Completed sales only"
          />
          <KpiCard
            label="Sellable Medicines"
            value={String(catalog?.medicines.length ?? 0)}
            note={`Live stock available in ${branchName}`}
          />
          <KpiCard
            label="Cart Units"
            value={String(cartTotals.itemCount)}
            note={cart.length === 0 ? "Awaiting selection" : `${cart.length} line items in cart`}
            valueColor={cart.length === 0 ? undefined : "#004253"}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        {receipt ? (
          <div className="mb-6 rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
            Sale <strong>{receipt.saleNumber}</strong> completed for ETB{" "}
            {formatCurrency(receipt.totalAmount)}.
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_380px]">
          <div className="space-y-6">
            <SurfaceCard className="overflow-hidden">
              <div
                className="flex flex-wrap items-center gap-3 px-6 py-4"
                style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
              >
                <div>
                  <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
                    Sales / POS
                  </h1>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Sell from live stock in {branchName} with automatic batch deduction.
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
                    placeholder="Search medicine, generic, or batch…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-10 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {(catalog?.medicines.length ?? 0) === 0 ? (
                <EmptyStateCard
                  title="No sellable inventory yet"
                  description="Receive stock first so the POS can draw from real available batches."
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
                />
              ) : filteredMedicines.length === 0 ? (
                <EmptyStateCard
                  title={`No results for "${search}"`}
                  description="Try a different medicine name, generic, or batch reference."
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
                />
              ) : (
                <div className="grid gap-4 p-6 lg:grid-cols-2">
                  {filteredMedicines.map((medicine) => (
                    <button
                      key={medicine.id}
                      type="button"
                      onClick={() => addToCart(medicine)}
                      className="rounded-xl bg-surface-low p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_8px_20px_rgba(0,66,83,0.08)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {medicine.name}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[
                              medicine.genericName,
                              medicine.form,
                              medicine.strength,
                            ]
                              .filter(Boolean)
                              .join(" • ") || "Sellable medicine"}
                          </p>
                        </div>
                        {medicine.isLowStock ? (
                          <StatusBadge label="Low Stock" tone="danger" />
                        ) : (
                          <StatusBadge label="Ready" tone="success" />
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                        <Metric label="Available" value={`${medicine.totalQuantityOnHand}`} />
                        <Metric
                          label="Current Rate"
                          value={`ETB ${formatCurrency(medicine.currentSellingPrice)}`}
                        />
                        <Metric
                          label="Batch"
                          value={medicine.currentBatchNumber ?? "—"}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1rem] font-bold text-on-surface">
                    Recent Sales
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Latest completed transactions from this branch
                  </p>
                </div>
              </div>

              {overview?.recentSales.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                        <th className="pb-3">Sale No.</th>
                        <th className="pb-3">Sold By</th>
                        <th className="pb-3">Items</th>
                        <th className="pb-3">Payment</th>
                        <th className="pb-3 text-right">Total</th>
                        <th className="pb-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentSales.map((sale) => (
                        <tr
                          key={sale.id}
                          style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                        >
                          <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                            {sale.saleNumber}
                          </td>
                          <td className="py-3 pr-3 text-sm text-on-surface-variant">
                            {sale.soldBy}
                          </td>
                          <td className="py-3 pr-3 text-sm text-on-surface-variant">
                            {sale.items
                              .slice(0, 2)
                              .map((item) => `${item.medicineName} x${item.quantity}`)
                              .join(", ")}
                            {sale.items.length > 2 ? " +" : ""}
                          </td>
                          <td className="py-3 pr-3 text-sm text-on-surface-variant">
                            {formatPaymentMethod(sale.paymentMethod)}
                          </td>
                          <td className="py-3 pr-3 text-right text-sm font-semibold text-on-surface">
                            ETB {formatCurrency(sale.totalAmount)}
                          </td>
                          <td className="py-3 text-right text-xs text-on-surface-variant">
                            {formatRelativeTime(sale.soldAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  title="No sales recorded yet"
                  description="The first completed POS transaction will appear here immediately."
                />
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1rem] font-bold text-on-surface">Checkout</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Review the cart and complete the transaction
                  </p>
                </div>
                <StatusBadge
                  label={cart.length === 0 ? "Cart Empty" : "Ready to Sell"}
                  tone={cart.length === 0 ? "neutral" : "success"}
                />
              </div>

              <div className="mt-5 space-y-3">
                {cart.length === 0 ? (
                  <EmptyStateCard
                    compact
                    title="No items in the cart"
                    description="Add medicines from the live catalog to start a sale."
                  />
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            Batch {item.currentBatchNumber ?? "—"} • ETB{" "}
                            {formatCurrency(item.currentSellingPrice)} each
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 0)}
                          className="text-xs font-semibold text-outline transition-colors hover:text-on-error-container"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <QuantityButton
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            -
                          </QuantityButton>
                          <span className="w-10 text-center text-sm font-semibold text-on-surface">
                            {item.quantity}
                          </span>
                          <QuantityButton
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= item.totalQuantityOnHand}
                          >
                            +
                          </QuantityButton>
                        </div>

                        <span className="text-sm font-bold text-on-surface">
                          ETB {formatCurrency(item.quantity * item.currentSellingPrice)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5">
                <label className="mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.06em] text-outline">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value as (typeof PAYMENT_METHODS)[number]["value"]
                    )
                  }
                  className="h-11 w-full rounded-lg bg-surface-lowest px-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  style={{
                    boxShadow: "0 1px 4px rgba(0,66,83,0.06)",
                    border: "1px solid rgba(0,66,83,0.10)",
                  }}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 space-y-3 rounded-lg bg-surface-low p-4">
                <SummaryRow
                  label="Cart items"
                  value={String(cartTotals.itemCount)}
                />
                <SummaryRow
                  label="Subtotal"
                  value={`ETB ${formatCurrency(cartTotals.subtotal)}`}
                />
              </div>

              <button
                type="button"
                onClick={() => void completeSale()}
                disabled={isSubmitting || cart.length === 0}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-lg text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
              >
                {isSubmitting ? "Processing Sale…" : "Complete Sale"}
              </button>
            </SurfaceCard>

            {receipt ? (
              <SurfaceCard className="p-6">
                <h2 className="text-[1rem] font-bold text-on-surface">Last Receipt</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {receipt.saleNumber} • {formatDateTime(receipt.soldAt)}
                </p>

                <div className="mt-5 space-y-3">
                  {receipt.items.map((item, index) => (
                    <div
                      key={`${item.medicineId}-${item.batchNumber}-${index}`}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-on-surface">
                          {item.medicineName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Batch {item.batchNumber} • {item.quantity} x ETB{" "}
                          {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <span className="font-semibold text-on-surface">
                        ETB {formatCurrency(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            ) : null}
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
      className="flex h-8 w-8 items-center justify-center rounded bg-surface-high text-sm font-bold text-on-surface transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPaymentMethod(method: SalesOverviewResponse["recentSales"][number]["paymentMethod"]) {
  return method
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
