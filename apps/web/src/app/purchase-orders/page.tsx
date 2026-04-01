"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
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
      setError("Choose a medicine before adding a purchase order line.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Requested quantity must be a whole number greater than zero.");
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setError("Unit cost must be a valid amount greater than zero.");
      return;
    }

    if (draftLines.some((line) => line.medicineId === selectedMedicine.id)) {
      setError("That medicine is already in the purchase order draft.");
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
            .join(" • ") || "Catalog medicine",
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
      setError(`${medicine.name} is already added to the draft order.`);
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
            .join(" • ") || "Catalog medicine",
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
      setError("Supplier name is required before creating a purchase order.");
      return;
    }

    if (!draftLines.length) {
      setError("Add at least one medicine to the purchase order draft.");
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
        `Purchase order ${createdOrder.orderNumber} created for ${createdOrder.supplierName}.`
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
      setError("Select an order before receiving stock.");
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
      setError("Enter at least one received line before submitting the delivery.");
      return;
    }

    for (const { item, form } of itemsToReceive) {
      if (!form.batchNumber.trim()) {
        setError(`Batch number is required for ${item.medicine.name}.`);
        return;
      }

      if (!form.expiryDate) {
        setError(`Expiry date is required for ${item.medicine.name}.`);
        return;
      }

      const receivedQuantity = Number(form.receivedQuantity);
      const costPrice = Number(form.costPrice);
      const sellingPrice = Number(form.sellingPrice);

      if (!Number.isInteger(receivedQuantity) || receivedQuantity < 1) {
        setError(`Received quantity for ${item.medicine.name} must be a whole number.`);
        return;
      }

      if (receivedQuantity > item.outstandingQuantity) {
        setError(
          `${item.medicine.name} only has ${item.outstandingQuantity} units outstanding on this order.`
        );
        return;
      }

      if (!Number.isFinite(costPrice) || costPrice <= 0) {
        setError(`Cost price for ${item.medicine.name} must be greater than zero.`);
        return;
      }

      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        setError(
          `Selling price for ${item.medicine.name} must be greater than zero.`
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
        `Delivery posted for ${updatedOrder.orderNumber}. Status is now ${formatStatusLabel(
          updatedOrder.status
        ).toLowerCase()}.`
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
    return <AppLoading message="Loading restocking workspace…" />;
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
              Restocking Workspace
            </h1>
            <p className="mt-2 max-w-[760px] text-sm text-on-surface-variant">
              Raise supplier orders from live low-stock signals, then receive delivered
              stock directly into inventory batches for {orders?.branch.name ?? session.branch?.name ?? "this branch"}.
            </p>
          </div>

          <div className="ml-auto rounded-full bg-surface-low px-4 py-2 text-xs font-semibold text-on-surface-variant">
            {catalogMetrics.lowStockCount} low-stock medicines waiting on replenishment
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label="Open Orders"
            value={String(orderMetrics.openOrders)}
            note={`${orderMetrics.outstandingUnits.toLocaleString("en-US")} units still outstanding`}
          />
          <KpiCard
            label="Low Stock"
            value={String(catalogMetrics.lowStockCount)}
            valueColor="#93000a"
            note={`${catalogMetrics.recommendedOrderUnits.toLocaleString("en-US")} units recommended`}
          />
          <KpiCard
            label="Total Ordered Value"
            value={`ETB ${formatCurrency(orderMetrics.totalOrderedValue)}`}
            note={`${orderMetrics.totalOrders} purchase orders tracked`}
          />
          <KpiCard
            label="Received Orders"
            value={String(orderMetrics.receivedOrders)}
            valueColor="#1f5f26"
            note="Completed supplier deliveries"
          />
          <KpiCard
            label="Draft Total"
            value={`ETB ${formatCurrency(draftTotalValue)}`}
            note={`${draftLines.length} lines currently staged`}
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
                title="Purchase Orders"
                description="Track open and received supplier orders for the branch."
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
                    placeholder="Search order or supplier…"
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
                            label={formatStatusLabel(order.status)}
                            tone={statusTone(order.status)}
                          />
                        </div>

                        <div className="mt-4 grid gap-3 text-xs md:grid-cols-4">
                          <Metric
                            label="Ordered"
                            value={order.totalRequestedQuantity.toLocaleString("en-US")}
                          />
                          <Metric
                            label="Received"
                            value={order.totalReceivedQuantity.toLocaleString("en-US")}
                          />
                          <Metric
                            label="Outstanding"
                            value={order.outstandingQuantity.toLocaleString("en-US")}
                          />
                          <Metric
                            label="Value"
                            value={`ETB ${formatCurrency(order.totalOrderedValue)}`}
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
                    title="No purchase orders yet"
                    description="Create the first restocking order from the draft panel to start supplier tracking."
                  />
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="overflow-hidden">
              <SectionHeader
                title="Low-Stock Suggestions"
                description="Quick-start reorder lines from medicines already under the branch threshold."
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
                              .join(" • ") || "Catalog medicine"}
                          </p>
                        </div>
                        <StatusBadge label="Low stock" tone="danger" />
                      </div>

                      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                        <Metric
                          label="Units On Hand"
                          value={medicine.totalQuantityOnHand.toLocaleString("en-US")}
                        />
                        <Metric
                          label="Suggested Order"
                          value={medicine.recommendedOrderQuantity.toLocaleString("en-US")}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddRecommendedMedicine(medicine.id)}
                        className="mt-4 flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
                      >
                        Add Suggested Line
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <EmptyStateCard
                    compact
                    title="No low-stock recommendations"
                    description="Once branch stock falls under the threshold, suggested reorder lines will appear here."
                  />
                </div>
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Create Purchase Order</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Stage medicines, supplier, and cost assumptions before ordering.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleCreateOrder}>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                    Supplier Name
                  </span>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    className="h-11 w-full rounded-lg border border-outline/10 bg-surface-low px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="EPSS, local wholesaler, or distributor"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-[1fr_110px_110px]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                      Medicine
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
                          {medicine.name} ({medicine.totalQuantityOnHand} on hand)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                      Quantity
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
                      Unit Cost
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
                  Add Draft Line
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
                            {line.quantity} units • ETB {formatCurrency(line.unitCost)} each
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDraftLine(line.medicineId)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-error hover:bg-error-container hover:text-on-error-container"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyStateCard
                    compact
                    title="Draft is empty"
                    description="Add one or more medicines to build the purchase order."
                  />
                )}

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                    Notes
                  </span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full rounded-lg border border-outline/10 bg-surface-low px-3 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Optional supplier or order notes."
                  />
                </label>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
                >
                  {isCreating ? "Creating order…" : "Create Purchase Order"}
                </button>
              </form>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <div className="mb-5">
                <h2 className="text-[1rem] font-bold text-on-surface">Receive Delivery</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Convert an open supplier order into real stock batches.
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
                          {selectedOrder.supplierName} • {selectedOrder.totalRequestedQuantity} requested
                        </p>
                      </div>
                      <StatusBadge
                        label={formatStatusLabel(selectedOrder.status)}
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
                                    {item.outstandingQuantity} units outstanding • ETB{" "}
                                    {formatCurrency(item.unitCost)} expected cost
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-3">
                                <label className="block">
                                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                    Batch Number
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
                                    placeholder="Supplier batch code"
                                  />
                                </label>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-outline">
                                      Expiry Date
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
                                      Received Quantity
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
                                      Cost Price
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
                                      Selling Price
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
                        {isReceiving ? "Posting delivery…" : "Receive Delivery"}
                      </button>
                    </form>
                  ) : (
                    <div className="mt-5">
                      <EmptyStateCard
                        compact
                        title="No outstanding lines"
                        description="This order has already been fully received into stock."
                      />
                    </div>
                  )}
                </>
              ) : (
                <EmptyStateCard
                  compact
                  title="No order selected"
                  description="Choose an order from the list to receive supplier stock."
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

function formatStatusLabel(status: PurchaseOrderRecord["status"]) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getFutureDateInputValue(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
