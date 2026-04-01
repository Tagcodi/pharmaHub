"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import { useI18n } from "../i18n/I18nProvider";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type PurchaseOrderCatalogResponse,
  type PurchaseOrderRecord,
  type PurchaseOrdersResponse,
  type SessionResponse,
} from "../lib/api";

type DraftLine = {
  medicineId: string;
  name: string;
  details: string;
  quantity: number;
  unitCost: number;
};

type ReceiptLineState = {
  batchNumber: string;
  expiryDate: string;
  receivedQuantity: string;
  costPrice: string;
  sellingPrice: string;
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [catalog, setCatalog] = useState<PurchaseOrderCatalogResponse | null>(null);
  const [orders, setOrders] = useState<PurchaseOrdersResponse | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftUnitCost, setDraftUnitCost] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [receiptLines, setReceiptLines] = useState<Record<string, ReceiptLineState>>(
    {}
  );
  const [orderSearch, setOrderSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!catalog?.medicines.length) {
      return;
    }

    if (!selectedMedicineId) {
      setSelectedMedicineId(catalog.lowStockMedicines[0]?.id ?? catalog.medicines[0]?.id ?? "");
      return;
    }

    const stillExists = catalog.medicines.some(
      (medicine) => medicine.id === selectedMedicineId
    );

    if (!stillExists) {
      setSelectedMedicineId(catalog.lowStockMedicines[0]?.id ?? catalog.medicines[0]?.id ?? "");
    }
  }, [catalog, selectedMedicineId]);

  useEffect(() => {
    if (!catalog?.medicines.length) {
      return;
    }

    const selectedMedicine =
      catalog.medicines.find((medicine) => medicine.id === selectedMedicineId) ?? null;

    if (!selectedMedicine) {
      return;
    }

    if (!draftUnitCost) {
      setDraftUnitCost(
        selectedMedicine.lastCostPrice
          ? selectedMedicine.lastCostPrice.toFixed(2)
          : ""
      );
    }
  }, [catalog, selectedMedicineId, draftUnitCost]);

  useEffect(() => {
    const availableOrders = orders?.orders ?? [];

    if (!availableOrders.length) {
      setSelectedOrderId(null);
      return;
    }

    if (!selectedOrderId) {
      const preferred =
        availableOrders.find(
          (order) => order.status === "OPEN" || order.status === "PARTIALLY_RECEIVED"
        ) ?? availableOrders[0];

      setSelectedOrderId(preferred?.id ?? null);
      return;
    }

    const stillExists = availableOrders.some((order) => order.id === selectedOrderId);

    if (!stillExists) {
      setSelectedOrderId(availableOrders[0]?.id ?? null);
    }
  }, [orders, selectedOrderId]);

  const selectedOrder =
    orders?.orders.find((order) => order.id === selectedOrderId) ?? null;

  useEffect(() => {
    if (!selectedOrder) {
      setReceiptLines({});
      return;
    }

    const nextReceiptLines: Record<string, ReceiptLineState> = {};

    for (const item of selectedOrder.items) {
      if (item.outstandingQuantity <= 0) {
        continue;
      }

      const medicineCatalog =
        catalog?.medicines.find((medicine) => medicine.id === item.medicine.id) ?? null;
      const suggestedSellingPrice =
        medicineCatalog?.lastSellingPrice ?? Math.max(item.unitCost * 1.3, item.unitCost + 1);

      nextReceiptLines[item.id] = {
        batchNumber: "",
        expiryDate: getFutureDateInputValue(180),
        receivedQuantity: String(item.outstandingQuantity),
        costPrice: item.unitCost.toFixed(2),
        sellingPrice: suggestedSellingPrice.toFixed(2),
      };
    }

    setReceiptLines(nextReceiptLines);
  }, [selectedOrderId, selectedOrder, catalog]);

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

      const [catalogData, ordersData] = await Promise.all([
        fetchJson<PurchaseOrderCatalogResponse>("/purchase-orders/catalog", {
          headers: getAuthHeaders(token),
        }),
        fetchJson<PurchaseOrdersResponse>("/purchase-orders", {
          headers: getAuthHeaders(token),
        }),
      ]);

      setCatalog(catalogData);
      setOrders(ordersData);
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

  async function refreshWorkspace() {
    const token = getStoredToken();

    if (!token) {
      return;
    }

    const [catalogData, ordersData] = await Promise.all([
      fetchJson<PurchaseOrderCatalogResponse>("/purchase-orders/catalog", {
        headers: getAuthHeaders(token),
      }),
      fetchJson<PurchaseOrdersResponse>("/purchase-orders", {
        headers: getAuthHeaders(token),
      }),
    ]);

    setCatalog(catalogData);
    setOrders(ordersData);
  }

  function handleAddDraftLine() {
    const selectedMedicine =
      catalog?.medicines.find((medicine) => medicine.id === selectedMedicineId) ?? null;
    const quantity = Number(draftQuantity);
    const unitCost = Number(draftUnitCost);

    if (!selectedMedicine) {
      setError(t("purchaseOrders.error.chooseMedicine"));
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError(t("purchaseOrders.error.invalidQuantity"));
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setError(t("purchaseOrders.error.invalidUnitCost"));
      return;
    }

    if (draftLines.some((line) => line.medicineId === selectedMedicine.id)) {
      setError(t("purchaseOrders.error.duplicateDraft"));
      return;
    }

    setDraftLines((current) => [
      ...current,
      {
        medicineId: selectedMedicine.id,
        name: selectedMedicine.name,
        details:
          [selectedMedicine.genericName, selectedMedicine.form, selectedMedicine.strength]
            .filter(Boolean)
            .join(" • ") || t("common.catalogMedicine"),
        quantity,
        unitCost,
      },
    ]);
    setDraftQuantity(String(selectedMedicine.recommendedOrderQuantity || 1));
    setDraftUnitCost(
      selectedMedicine.lastCostPrice ? selectedMedicine.lastCostPrice.toFixed(2) : ""
    );
    setError(null);
  }

  function handleAddRecommendedMedicine(medicineId: string) {
    const medicine =
      catalog?.lowStockMedicines.find((item) => item.id === medicineId) ?? null;

    if (!medicine) {
      return;
    }

    if (draftLines.some((line) => line.medicineId === medicine.id)) {
      setError(
        t("purchaseOrders.error.duplicateSuggested", {
          medicineName: medicine.name,
        })
      );
      return;
    }

    setDraftLines((current) => [
      ...current,
      {
        medicineId: medicine.id,
        name: medicine.name,
        details:
          [medicine.genericName, medicine.form, medicine.strength]
            .filter(Boolean)
            .join(" • ") || t("common.catalogMedicine"),
        quantity: medicine.recommendedOrderQuantity,
        unitCost: medicine.lastCostPrice ?? 0,
      },
    ]);

    if (!supplierName && medicine.lastSupplierName) {
      setSupplierName(medicine.lastSupplierName);
    }

    setError(null);
  }

  function removeDraftLine(medicineId: string) {
    setDraftLines((current) =>
      current.filter((line) => line.medicineId !== medicineId)
    );
  }

  async function handleCreateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!supplierName.trim()) {
      setError(t("purchaseOrders.error.supplierRequired"));
      return;
    }

    if (!draftLines.length) {
      setError(t("purchaseOrders.error.draftRequired"));
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const createdOrder = await fetchJson<PurchaseOrderRecord>("/purchase-orders", {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          supplierName: supplierName.trim(),
          notes: notes.trim() || undefined,
          items: draftLines.map((line) => ({
            medicineId: line.medicineId,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        }),
      });

      setSuccessMessage(
        t("purchaseOrders.success.created", {
          orderNumber: createdOrder.orderNumber,
          supplierName: createdOrder.supplierName,
        })
      );
      setSupplierName("");
      setNotes("");
      setDraftLines([]);
      setSelectedOrderId(createdOrder.id);
      await refreshWorkspace();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsCreating(false);
    }
  }

  function updateReceiptLine(
    itemId: string,
    field: keyof ReceiptLineState,
    value: string
  ) {
    setReceiptLines((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          batchNumber: "",
          expiryDate: "",
          receivedQuantity: "",
          costPrice: "",
          sellingPrice: "",
        }),
        [field]: value,
      },
    }));
  }

  async function handleReceiveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!selectedOrder) {
      setError(t("purchaseOrders.error.selectOrder"));
      return;
    }

    const itemsToReceive = selectedOrder.items.reduce<
      Array<{
        item: PurchaseOrderRecord["items"][number];
        form: ReceiptLineState;
      }>
    >((acc, item) => {
      if (item.outstandingQuantity <= 0) {
        return acc;
      }

      const form = receiptLines[item.id];

      if (!form || Number(form.receivedQuantity) <= 0) {
        return acc;
      }

      acc.push({ item, form });
      return acc;
    }, []);

    if (!itemsToReceive.length) {
      setError(t("purchaseOrders.error.receivedLineRequired"));
      return;
    }

    for (const { item, form } of itemsToReceive) {
      if (!form.batchNumber.trim()) {
        setError(
          t("purchaseOrders.error.batchRequired", {
            medicineName: item.medicine.name,
          })
        );
        return;
      }

      if (!form.expiryDate) {
        setError(
          t("purchaseOrders.error.expiryRequired", {
            medicineName: item.medicine.name,
          })
        );
        return;
      }

      const receivedQuantity = Number(form.receivedQuantity);
      const costPrice = Number(form.costPrice);
      const sellingPrice = Number(form.sellingPrice);

      if (!Number.isInteger(receivedQuantity) || receivedQuantity < 1) {
        setError(
          t("purchaseOrders.error.receivedQuantityInvalid", {
            medicineName: item.medicine.name,
          })
        );
        return;
      }

      if (receivedQuantity > item.outstandingQuantity) {
        setError(
          t("purchaseOrders.error.outstandingExceeded", {
            medicineName: item.medicine.name,
            count: item.outstandingQuantity,
          })
        );
        return;
      }

      if (!Number.isFinite(costPrice) || costPrice <= 0) {
        setError(
          t("purchaseOrders.error.costPriceInvalid", {
            medicineName: item.medicine.name,
          })
        );
        return;
      }

      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        setError(
          t("purchaseOrders.error.sellingPriceInvalid", {
            medicineName: item.medicine.name,
          })
        );
        return;
      }
    }

    setIsReceiving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedOrder = await fetchJson<PurchaseOrderRecord>(
        `/purchase-orders/${selectedOrder.id}/receive`,
        {
          method: "POST",
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            items: itemsToReceive.map(({ item, form }) => ({
              purchaseOrderItemId: item.id,
              batchNumber: form.batchNumber.trim(),
              expiryDate: new Date(form.expiryDate).toISOString(),
              receivedQuantity: Number(form.receivedQuantity),
              costPrice: Number(form.costPrice),
              sellingPrice: Number(form.sellingPrice),
            })),
          }),
        }
      );

      setSuccessMessage(
        t("purchaseOrders.success.received", {
          orderNumber: updatedOrder.orderNumber,
          status: formatStatusLabel(updatedOrder.status, t).toLowerCase(),
        })
      );
      setSelectedOrderId(updatedOrder.id);
      await refreshWorkspace();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsReceiving(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const items = orders?.orders ?? [];
    const query = orderSearch.trim().toLowerCase();

    return items.filter((order) => {
      if (!query) {
        return true;
      }

      return (
        order.orderNumber.toLowerCase().includes(query) ||
        order.supplierName.toLowerCase().includes(query) ||
        order.items.some((item) =>
          item.medicine.name.toLowerCase().includes(query)
        )
      );
    });
  }, [orders?.orders, orderSearch]);

  if (isLoading) {
    return <AppLoading message={t("common.loading.restockingWorkspace")} />;
  }

  if (!session) {
    return null;
  }

  const catalogMetrics = catalog?.metrics ?? {
    totalMedicines: 0,
    lowStockCount: 0,
    recommendedOrderUnits: 0,
    openOrderCount: 0,
    outstandingOrderUnits: 0,
  };

  const orderMetrics = orders?.metrics ?? {
    totalOrders: 0,
    openOrders: 0,
    receivedOrders: 0,
    cancelledOrders: 0,
    totalOrderedValue: 0,
    outstandingUnits: 0,
  };

  const draftTotalValue = draftLines.reduce(
    (sum, line) => sum + line.quantity * line.unitCost,
    0
  );

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1380px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start gap-5">
          <div>
            <h1 className="text-[2.2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {t("purchaseOrders.title")}
            </h1>
            <p className="mt-2 max-w-[760px] text-sm text-on-surface-variant">
              {t("purchaseOrders.subtitle", {
                branch:
                  orders?.branch.name ?? session.branch?.name ?? t("common.currentBranch"),
              })}
            </p>
          </div>

          <div className="ml-auto rounded-full bg-surface-low px-4 py-2 text-xs font-semibold text-on-surface-variant">
            {t("purchaseOrders.notice.lowStock", {
              count: formatNumber(catalogMetrics.lowStockCount, locale),
            })}
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label={t("purchaseOrders.kpi.openOrders")}
            value={String(orderMetrics.openOrders)}
            note={t("purchaseOrders.note.outstandingUnits", {
              count: formatNumber(orderMetrics.outstandingUnits, locale),
            })}
          />
          <KpiCard
            label={t("purchaseOrders.kpi.lowStock")}
            value={String(catalogMetrics.lowStockCount)}
            valueColor="#93000a"
            note={t("purchaseOrders.note.recommendedUnits", {
              count: formatNumber(catalogMetrics.recommendedOrderUnits, locale),
            })}
          />
          <KpiCard
            label={t("purchaseOrders.kpi.totalOrderedValue")}
            value={`ETB ${formatCurrency(orderMetrics.totalOrderedValue, locale)}`}
            note={t("purchaseOrders.note.totalOrders", {
              count: formatNumber(orderMetrics.totalOrders, locale),
            })}
          />
          <KpiCard
            label={t("purchaseOrders.kpi.receivedOrders")}
            value={String(orderMetrics.receivedOrders)}
            valueColor="#1f5f26"
            note={t("purchaseOrders.note.completedDeliveries")}
          />
          <KpiCard
            label={t("purchaseOrders.kpi.draftTotal")}
            value={`ETB ${formatCurrency(draftTotalValue, locale)}`}
            note={t("purchaseOrders.note.draftLines", {
              count: formatNumber(draftLines.length, locale),
            })}
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

        <div className="grid gap-6 xl:grid-cols-[1.1fr_430px]">
          <div className="space-y-6">
            <SurfaceCard className="overflow-hidden">
              <SectionHeader
                title={t("purchaseOrders.section.orders")}
                description={t("purchaseOrders.section.ordersDescription")}
              >
                <div className="relative min-w-[250px] flex-1 max-w-[320px]">
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
                    placeholder={t("purchaseOrders.searchOrders")}
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    className="h-10 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </SectionHeader>

              {filteredOrders.length ? (
                <div className="space-y-4 p-6">
                  {filteredOrders.map((order) => {
                    const isSelected = order.id === selectedOrderId;

                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className={[
                          "w-full rounded-2xl border p-5 text-left transition-colors",
                          isSelected
                            ? "border-primary/20 bg-primary/[0.04]"
                            : "border-outline/10 bg-surface-lowest hover:bg-surface-low",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-on-surface">
                              {order.orderNumber}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {order.supplierName} • {order.createdBy}
                            </p>
                          </div>
                          <StatusBadge
                            label={formatStatusLabel(order.status, t)}
                            tone={statusTone(order.status)}
                          />
                        </div>

                        <div className="mt-4 grid gap-3 text-xs md:grid-cols-4">
                          <Metric
                            label={t("purchaseOrders.metric.ordered")}
                            value={formatNumber(order.totalRequestedQuantity, locale)}
                          />
                          <Metric
                            label={t("purchaseOrders.metric.received")}
                            value={formatNumber(order.totalReceivedQuantity, locale)}
                          />
                          <Metric
                            label={t("purchaseOrders.metric.outstanding")}
                            value={formatNumber(order.outstandingQuantity, locale)}
                          />
                          <Metric
                            label={t("purchaseOrders.metric.value")}
                            value={`ETB ${formatCurrency(order.totalOrderedValue, locale)}`}
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
                    title={t("purchaseOrders.empty.orders")}
                    description={t("purchaseOrders.empty.ordersDescription")}
                  />
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="overflow-hidden">
              <SectionHeader
                title={t("purchaseOrders.section.lowStock")}
                description={t("purchaseOrders.section.lowStockDescription")}
              />

              {catalog?.lowStockMedicines.length ? (
                <div className="grid gap-4 p-6 md:grid-cols-2">
                  {catalog.lowStockMedicines.slice(0, 6).map((medicine) => (
                    <div
                      key={medicine.id}
                      className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {medicine.name}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[medicine.genericName, medicine.form, medicine.strength]
                              .filter(Boolean)
                              .join(" • ") || t("common.catalogMedicine")}
                          </p>
                        </div>
                        <StatusBadge label={t("purchaseOrders.badge.lowStock")} tone="danger" />
                      </div>

                      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                        <Metric
                          label={t("purchaseOrders.metric.unitsOnHand")}
                          value={formatNumber(medicine.totalQuantityOnHand, locale)}
                        />
                        <Metric
                          label={t("purchaseOrders.metric.suggestedOrder")}
                          value={formatNumber(medicine.recommendedOrderQuantity, locale)}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddRecommendedMedicine(medicine.id)}
                        className="mt-4 flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
                      >
                        {t("purchaseOrders.button.addSuggestedLine")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <EmptyStateCard
                    compact
                    title={t("purchaseOrders.empty.lowStock")}
                    description={t("purchaseOrders.empty.lowStockDescription")}
                  />
                </div>
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">
                  {t("purchaseOrders.section.create")}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t("purchaseOrders.section.createDescription")}
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleCreateOrder}>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                    {t("purchaseOrders.field.supplierName")}
                  </span>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={t("purchaseOrders.placeholder.supplier")}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-[1fr_110px_110px]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                      {t("purchaseOrders.field.medicine")}
                    </span>
                    <select
                      value={selectedMedicineId}
                      onChange={(event) => {
                        setSelectedMedicineId(event.target.value);
                        const medicine =
                          catalog?.medicines.find(
                            (item) => item.id === event.target.value
                          ) ?? null;
                        setDraftQuantity(
                          String(medicine?.recommendedOrderQuantity || 1)
                        );
                        setDraftUnitCost(
                          medicine?.lastCostPrice
                            ? medicine.lastCostPrice.toFixed(2)
                            : ""
                        );
                      }}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {(catalog?.medicines ?? []).map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>
                          {medicine.name} (
                          {t("purchaseOrders.option.onHand", {
                            count: formatNumber(medicine.totalQuantityOnHand, locale),
                          })}
                          )
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                      {t("purchaseOrders.field.quantity")}
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draftQuantity}
                      onChange={(event) => setDraftQuantity(event.target.value)}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                      {t("purchaseOrders.field.unitCost")}
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={draftUnitCost}
                      onChange={(event) => setDraftUnitCost(event.target.value)}
                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleAddDraftLine}
                  className="flex h-11 w-full items-center justify-center rounded-lg border border-outline/10 bg-surface-low text-sm font-bold text-on-surface transition-colors hover:bg-surface"
                >
                  {t("purchaseOrders.button.addDraftLine")}
                </button>

                {draftLines.length ? (
                  <div className="space-y-3 rounded-2xl bg-surface-low p-4">
                    {draftLines.map((line) => (
                      <div
                        key={line.medicineId}
                        className="flex items-start justify-between gap-3 rounded-xl bg-surface-lowest p-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{line.name}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {line.details}
                          </p>
                          <p className="mt-2 text-xs text-on-surface-variant">
                            {t("purchaseOrders.note.lineUnitCost", {
                              count: formatNumber(line.quantity, locale),
                              amount: formatCurrency(line.unitCost, locale),
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDraftLine(line.medicineId)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-error hover:bg-error-container hover:text-on-error-container"
                        >
                          {t("purchaseOrders.button.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyStateCard
                    compact
                    title={t("purchaseOrders.empty.draft")}
                    description={t("purchaseOrders.empty.draftDescription")}
                  />
                )}

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                    {t("purchaseOrders.field.notes")}
                  </span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={t("purchaseOrders.placeholder.notes")}
                  />
                </label>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                >
                  {isCreating
                    ? t("purchaseOrders.button.creatingOrder")
                    : t("purchaseOrders.button.createOrder")}
                </button>
              </form>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">
                  {t("purchaseOrders.section.receive")}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t("purchaseOrders.section.receiveDescription")}
                </p>
              </div>

              {selectedOrder ? (
                <>
                  <div className="rounded-2xl bg-surface-low p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {selectedOrder.orderNumber}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {selectedOrder.supplierName} •{" "}
                          {t("purchaseOrders.note.requested", {
                            count: formatNumber(selectedOrder.totalRequestedQuantity, locale),
                          })}
                        </p>
                      </div>
                      <StatusBadge
                        label={formatStatusLabel(selectedOrder.status, t)}
                        tone={statusTone(selectedOrder.status)}
                      />
                    </div>
                  </div>

                  {selectedOrder.outstandingQuantity > 0 ? (
                    <form className="mt-5 space-y-4" onSubmit={handleReceiveOrder}>
                      {selectedOrder.items
                        .filter((item) => item.outstandingQuantity > 0)
                        .map((item) => {
                          const line = receiptLines[item.id];

                          return (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                            >
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-on-surface">
                                    {item.medicine.name}
                                  </p>
                                  <p className="mt-1 text-xs text-on-surface-variant">
                                    {t("purchaseOrders.note.outstandingUnits", {
                                      count: formatNumber(item.outstandingQuantity, locale),
                                    })}{" "}
                                    •{" "}
                                    {t("purchaseOrders.note.expectedCost", {
                                      amount: formatCurrency(item.unitCost, locale),
                                    })}
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-3">
                                <label className="block">
                                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                    {t("purchaseOrders.field.batchNumber")}
                                  </span>
                                  <input
                                    type="text"
                                    value={line?.batchNumber ?? ""}
                                    onChange={(event) =>
                                      updateReceiptLine(
                                        item.id,
                                        "batchNumber",
                                        event.target.value
                                      )
                                    }
                                    className="h-11 w-full rounded-lg border border-outline/10 bg-surface-lowest px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder={t("purchaseOrders.placeholder.batch")}
                                  />
                                </label>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                      {t("purchaseOrders.field.expiryDate")}
                                    </span>
                                    <input
                                      type="date"
                                      value={line?.expiryDate ?? ""}
                                      onChange={(event) =>
                                        updateReceiptLine(
                                          item.id,
                                          "expiryDate",
                                          event.target.value
                                        )
                                      }
                                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-lowest px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                      {t("purchaseOrders.field.receivedQuantity")}
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={line?.receivedQuantity ?? ""}
                                      onChange={(event) =>
                                        updateReceiptLine(
                                          item.id,
                                          "receivedQuantity",
                                          event.target.value
                                        )
                                      }
                                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-lowest px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </label>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                      {t("purchaseOrders.field.costPrice")}
                                    </span>
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={line?.costPrice ?? ""}
                                      onChange={(event) =>
                                        updateReceiptLine(
                                          item.id,
                                          "costPrice",
                                          event.target.value
                                        )
                                      }
                                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-lowest px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                      {t("purchaseOrders.field.sellingPrice")}
                                    </span>
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={line?.sellingPrice ?? ""}
                                      onChange={(event) =>
                                        updateReceiptLine(
                                          item.id,
                                          "sellingPrice",
                                          event.target.value
                                        )
                                      }
                                      className="h-11 w-full rounded-lg border border-outline/10 bg-surface-lowest px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      <button
                        type="submit"
                        disabled={isReceiving}
                        className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                      >
                        {isReceiving
                          ? t("purchaseOrders.button.postingDelivery")
                          : t("purchaseOrders.button.receiveDelivery")}
                      </button>
                    </form>
                  ) : (
                    <div className="mt-5">
                      <EmptyStateCard
                        compact
                        title={t("purchaseOrders.empty.outstanding")}
                        description={t("purchaseOrders.empty.outstandingDescription")}
                      />
                    </div>
                  )}
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title={t("purchaseOrders.empty.selectedOrder")}
                  description={t("purchaseOrders.empty.selectedOrderDescription")}
                />
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-6 py-5"
      style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
    >
      <div>
        <h2 className="text-[1rem] font-bold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>
      {children ? <div className="ml-auto">{children}</div> : null}
    </div>
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

function statusTone(
  status: PurchaseOrderRecord["status"]
): "success" | "warning" | "danger" | "info" {
  if (status === "RECEIVED") {
    return "success";
  }

  if (status === "PARTIALLY_RECEIVED") {
    return "info";
  }

  if (status === "CANCELLED") {
    return "danger";
  }

  return "warning";
}

function formatStatusLabel(
  status: PurchaseOrderRecord["status"],
  t: ReturnType<typeof useI18n>["t"]
) {
  if (status === "RECEIVED") {
    return t("purchaseOrders.status.received");
  }

  if (status === "PARTIALLY_RECEIVED") {
    return t("purchaseOrders.status.partiallyReceived");
  }

  if (status === "CANCELLED") {
    return t("purchaseOrders.status.cancelled");
  }

  return t("purchaseOrders.status.open");
}

function formatCurrency(
  value: number,
  locale: ReturnType<typeof useI18n>["locale"]
) {
  return value.toLocaleString(getIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(
  value: number,
  locale: ReturnType<typeof useI18n>["locale"]
) {
  return value.toLocaleString(getIntlLocale(locale));
}

function getFutureDateInputValue(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function getIntlLocale(locale: ReturnType<typeof useI18n>["locale"]) {
  if (locale === "am") {
    return "am-ET";
  }

  if (locale === "om") {
    return "om-ET";
  }

  return "en-US";
}
