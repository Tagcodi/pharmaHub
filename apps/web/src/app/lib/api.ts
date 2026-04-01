export const TOKEN_KEY = "pharmahub.accessToken";

export type PaymentMethodValue =
  | "CASH"
  | "CARD"
  | "MOBILE_MONEY"
  | "BANK_TRANSFER";

export type SetupStatus = {
  isSetupComplete: boolean;
};

export type SessionResponse = {
  accessToken?: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt?: string | null;
  };
  pharmacy: {
    id: string;
    name: string;
    slug: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export type MedicineCatalogRecord = {
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

export type InventoryMedicineSummary = MedicineCatalogRecord & {
  totalQuantityOnHand: number;
  totalStockValue: number;
  totalCostValue: number;
  activeBatchCount: number;
  nearExpiryBatchCount: number;
  currentBatchNumber: string | null;
  currentCostPrice: number | null;
  currentSellingPrice: number | null;
  latestBatchNumber: string | null;
  latestCostPrice: number | null;
  latestSellingPrice: number | null;
  lastReceivedAt: string | null;
  nextExpiryDate: string | null;
  supplierName: string | null;
  isLowStock: boolean;
  isExpiringSoon: boolean;
};

export type InventorySummaryResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  totals: {
    totalStockValue: number;
    totalCostValue: number;
    activeBatchCount: number;
    registeredMedicineCount: number;
    lowStockCount: number;
    nearExpiryBatchCount: number;
    totalUnitsOnHand: number;
    atRiskCount: number;
  };
  medicines: InventoryMedicineSummary[];
};

export type StockInResponse = {
  medicine: {
    id: string;
    name: string;
    genericName: string | null;
    brandName: string | null;
    sku: string | null;
    form: string | null;
    strength: string | null;
    category: string | null;
    unit: string | null;
  };
  batch: {
    id: string;
    batchNumber: string;
    quantityOnHand: number;
    expiryDate: string;
    sellingPrice: number;
    costPrice: number;
    supplierName: string | null;
    receivedAt: string;
  };
};

export type DashboardOverviewResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalInventoryValue: number;
    registeredMedicines: number;
    activeBatches: number;
    lowStockCount: number;
    nearExpiryBatchCount: number;
    criticalAlertCount: number;
    totalUnitsOnHand: number;
  };
  weeklyInventoryValue: Array<{
    dayKey: string;
    label: string;
    value: number;
    date: string;
  }>;
  expiryItems: Array<{
    id: string;
    medicineName: string;
    batchNumber: string;
    stock: number;
    expiryDate: string;
    status: "CRITICAL" | "WARNING" | "NORMAL";
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    category: string;
    title: string;
    description: string;
    tone: "success" | "info" | "neutral" | "danger" | "warning";
    actor: string;
    createdAt: string;
  }>;
};

export type AdjustmentReason =
  | "DAMAGE"
  | "EXPIRED"
  | "COUNT_CORRECTION"
  | "RETURN_TO_SUPPLIER"
  | "LOST"
  | "THEFT_SUSPECTED"
  | "OTHER";

export type AdjustmentCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  medicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    brandName: string | null;
    form: string | null;
    strength: string | null;
    category: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    activeBatchCount: number;
    isLowStock: boolean;
    batches: Array<{
      id: string;
      batchNumber: string;
      expiryDate: string;
      quantityOnHand: number;
      costPrice: number;
      sellingPrice: number;
      supplierName: string | null;
      receivedAt: string;
      isExpiringSoon: boolean;
    }>;
  }>;
};

export type InventoryAdjustmentsResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalAdjustments: number;
    positiveAdjustments: number;
    negativeAdjustments: number;
    suspectedLossCount: number;
    netUnitsDelta: number;
  };
  adjustments: Array<{
    id: string;
    reason: AdjustmentReason;
    notes: string | null;
    quantityDelta: number;
    quantityAfter: number;
    createdAt: string;
    createdBy: string;
    medicine: {
      id: string;
      name: string;
    };
    batch: {
      id: string;
      batchNumber: string;
      expiryDate: string;
      currentQuantityOnHand: number;
    };
  }>;
};

export type CreateAdjustmentResponse = {
  id: string;
  reason: AdjustmentReason;
  notes: string | null;
  quantityDelta: number;
  quantityAfter: number;
  createdAt: string;
  medicine: {
    id: string;
    name: string;
  };
  batch: {
    id: string;
    batchNumber: string;
  };
};

export type DisposalCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalBatches: number;
    totalUnitsOnHand: number;
    expiredBatchCount: number;
    expiringSoonBatchCount: number;
    returnableBatchCount: number;
  };
  batches: Array<{
    stockBatchId: string;
    medicineId: string;
    medicineName: string;
    genericName: string | null;
    brandName: string | null;
    form: string | null;
    strength: string | null;
    category: string | null;
    unit: string | null;
    batchNumber: string;
    expiryDate: string;
    quantityOnHand: number;
    costPrice: number;
    sellingPrice: number;
    supplierName: string | null;
    receivedAt: string;
    isExpired: boolean;
    isExpiringSoon: boolean;
    canReturnToSupplier: boolean;
    estimatedRetailValue: number;
    estimatedCostValue: number;
  }>;
};

export type InventoryDisposalsResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalDisposals: number;
    damagedCount: number;
    expiredCount: number;
    returnedCount: number;
    totalUnitsRemoved: number;
    totalRetailValueRemoved: number;
  };
  disposals: Array<{
    id: string;
    reason: "DAMAGE" | "EXPIRED" | "RETURN_TO_SUPPLIER";
    notes: string | null;
    quantityRemoved: number;
    quantityAfter: number;
    createdAt: string;
    createdBy: string;
    medicine: {
      id: string;
      name: string;
    };
    batch: {
      id: string;
      batchNumber: string;
      expiryDate: string;
      currentQuantityOnHand: number;
      supplierName: string | null;
    };
    estimatedRetailValueRemoved: number;
    estimatedCostValueRemoved: number;
  }>;
};

export type CreateDisposalResponse = {
  id: string;
  reason: "DAMAGE" | "EXPIRED" | "RETURN_TO_SUPPLIER";
  notes: string | null;
  quantityRemoved: number;
  quantityAfter: number;
  createdAt: string;
  medicine: {
    id: string;
    name: string;
  };
  batch: {
    id: string;
    batchNumber: string;
  };
  supplierName: string | null;
};

export type CycleCountCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalBatches: number;
    totalUnitsOnHand: number;
    expiringSoonBatchCount: number;
    lowStockMedicineCount: number;
  };
  batches: Array<{
    stockBatchId: string;
    medicineId: string;
    medicineName: string;
    genericName: string | null;
    brandName: string | null;
    form: string | null;
    strength: string | null;
    category: string | null;
    unit: string | null;
    batchNumber: string;
    expiryDate: string;
    systemQuantity: number;
    totalMedicineQuantity: number;
    supplierName: string | null;
    receivedAt: string;
    isExpiringSoon: boolean;
    isLowStock: boolean;
  }>;
};

export type CycleCountsResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    countEvents: number;
    matchedCount: number;
    varianceCount: number;
    shortageEvents: number;
    overageEvents: number;
    netVarianceUnits: number;
  };
  counts: Array<{
    id: string;
    batchNumber: string;
    medicineName: string;
    previousQuantity: number;
    countedQuantity: number;
    quantityDelta: number;
    notes: string | null;
    createdBy: string;
    createdAt: string;
    varianceType: "MATCH" | "SHORTAGE" | "OVERAGE";
  }>;
};

export type CreateCycleCountResponse = {
  id: string;
  medicine: {
    id: string;
    name: string;
  };
  batchNumber: string;
  previousQuantity: number;
  countedQuantity: number;
  quantityDelta: number;
  notes: string | null;
  varianceType: "MATCH" | "SHORTAGE" | "OVERAGE";
  createdAt: string;
};

export type AlertsOverviewResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    lowStockCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    suspectedLossCount: number;
    cycleCountShortageCount: number;
    voidedSaleCount: number;
  };
  lowStockMedicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    activeBatchCount: number;
    totalStockValue: number;
    currentBatchNumber: string | null;
    nextExpiryDate: string | null;
    status: "CRITICAL" | "WARNING";
  }>;
  expiryBatches: Array<{
    id: string;
    medicineId: string;
    medicineName: string;
    genericName: string | null;
    batchNumber: string;
    quantityOnHand: number;
    sellingPrice: number;
    supplierName: string | null;
    expiryDate: string;
    receivedAt: string;
    daysUntilExpiry: number;
    status: "EXPIRED" | "CRITICAL" | "WARNING";
  }>;
  inventorySignals: Array<{
    id: string;
    type: "COUNT_SHORTAGE" | "THEFT_SUSPECTED" | "LOST";
    severity: "CRITICAL" | "WARNING";
    title: string;
    description: string;
    medicineName: string;
    batchNumber: string;
    quantityDelta: number;
    actor: string;
    createdAt: string;
  }>;
  salesSignals: Array<{
    id: string;
    type: "SALE_VOIDED";
    severity: "WARNING";
    title: string;
    description: string;
    saleNumber: string;
    reason: string | null;
    totalAmount: number | null;
    actor: string;
    createdAt: string;
  }>;
};

export type PurchaseOrderCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalMedicines: number;
    lowStockCount: number;
    recommendedOrderUnits: number;
    openOrderCount: number;
    outstandingOrderUnits: number;
  };
  lowStockMedicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    activeBatchCount: number;
    isLowStock: boolean;
    recommendedOrderQuantity: number;
    lastSupplierName: string | null;
    lastCostPrice: number | null;
    lastSellingPrice: number | null;
    nextExpiryDate: string | null;
  }>;
  medicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    activeBatchCount: number;
    isLowStock: boolean;
    recommendedOrderQuantity: number;
    lastSupplierName: string | null;
    lastCostPrice: number | null;
    lastSellingPrice: number | null;
    nextExpiryDate: string | null;
  }>;
};

export type PurchaseOrderRecord = {
  id: string;
  orderNumber: string;
  status: "OPEN" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  supplierName: string;
  notes: string | null;
  orderedAt: string;
  receivedAt: string | null;
  createdAt: string;
  createdBy: string;
  totalRequestedQuantity: number;
  totalReceivedQuantity: number;
  outstandingQuantity: number;
  totalOrderedValue: number;
  items: Array<{
    id: string;
    requestedQuantity: number;
    receivedQuantity: number;
    outstandingQuantity: number;
    unitCost: number;
    lineValue: number;
    medicine: {
      id: string;
      name: string;
      genericName: string | null;
      form: string | null;
      strength: string | null;
      unit: string | null;
    };
  }>;
};

export type PurchaseOrdersResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalOrders: number;
    openOrders: number;
    receivedOrders: number;
    cancelledOrders: number;
    totalOrderedValue: number;
    outstandingUnits: number;
  };
  orders: PurchaseOrderRecord[];
};

export type PrescriptionStatus =
  | "RECEIVED"
  | "IN_REVIEW"
  | "READY"
  | "DISPENSED"
  | "CANCELLED";

export type PrescriptionCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalMedicines: number;
    stockedMedicines: number;
    lowStockCount: number;
  };
  medicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    activeBatchCount: number;
    isLowStock: boolean;
    nextExpiryDate: string | null;
    currentSellingPrice: number | null;
  }>;
};

export type PrescriptionRecord = {
  id: string;
  prescriptionNumber: string;
  patientName: string;
  patientPhone: string | null;
  prescriberName: string | null;
  notes: string | null;
  status: PrescriptionStatus;
  receivedAt: string;
  promisedAt: string | null;
  preparedAt: string | null;
  dispensedAt: string | null;
  createdAt: string;
  createdBy: string;
  itemCount: number;
  totalRequestedUnits: number;
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: number;
    paymentMethod: PaymentMethodValue;
    soldAt: string;
    status: "COMPLETED" | "VOIDED";
  } | null;
  items: Array<{
    id: string;
    medicineId: string | null;
    medicineName: string;
    quantity: number;
    instructions: string | null;
    medicine: {
      id: string;
      genericName: string | null;
      form: string | null;
      strength: string | null;
      unit: string | null;
    } | null;
  }>;
};

export type PrescriptionsQueueResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalPrescriptions: number;
    activeQueueCount: number;
    receivedCount: number;
    inReviewCount: number;
    readyCount: number;
    dispensedTodayCount: number;
  };
  prescriptions: PrescriptionRecord[];
};

export type AuditLogsResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    totalEvents: number;
    stockAdjustments: number;
    suspectedLossEvents: number;
    failedLoginCount: number;
  };
  items: Array<{
    id: string;
    action: string;
    category: "Inventory" | "Sales" | "Access" | "Users" | "Catalog";
    title: string;
    description: string;
    tone: "success" | "info" | "neutral" | "danger" | "warning";
    actor: string;
    createdAt: string;
  }>;
};

export type SalesCatalogResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  medicines: Array<{
    id: string;
    name: string;
    genericName: string | null;
    brandName: string | null;
    category: string | null;
    form: string | null;
    strength: string | null;
    unit: string | null;
    totalQuantityOnHand: number;
    currentSellingPrice: number;
    currentBatchNumber: string | null;
    nextExpiryDate: string | null;
    isLowStock: boolean;
  }>;
};

export type SalesOverviewResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  metrics: {
    todaySalesAmount: number;
    todaySalesCount: number;
    averageTicket: number;
  };
  recentSales: Array<{
    id: string;
    saleNumber: string;
    totalAmount: number;
    paymentMethod: PaymentMethodValue;
    status: "COMPLETED" | "VOIDED";
    soldAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    voidedBy: string | null;
    soldBy: string;
    itemCount: number;
    items: Array<{
      medicineName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
  }>;
};

export type VoidSaleResponse = {
  id: string;
  saleNumber: string;
  status: "VOIDED";
  totalAmount: number;
  paymentMethod: PaymentMethodValue;
  soldAt: string;
  voidedAt: string;
  reason: string;
  notes: string | null;
  items: Array<{
    medicineName: string;
    quantity: number;
    batchNumber: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  prescription: {
    id: string;
    prescriptionNumber: string;
    status: "READY";
  } | null;
};

export type SalesReconciliationResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totals: {
    openingUnitsOnHand: number;
    closingUnitsOnHand: number;
    movementNetUnits: number;
    stockInUnits: number;
    saleUnits: number;
    voidRestorationUnits: number;
    adjustmentInUnits: number;
    adjustmentOutUnits: number;
    damageUnits: number;
    expiredUnits: number;
    supplierReturnUnits: number;
    grossSalesCount: number;
    completedSalesCount: number;
    voidedSalesCount: number;
    grossSalesAmount: number;
    netSalesAmount: number;
    voidedSalesAmount: number;
    suspectedLossCount: number;
    adjustmentEventCount: number;
  };
  recentVoids: Array<{
    id: string;
    saleId: string | null;
    saleNumber: string;
    totalAmount: number;
    itemCount: number;
    reason: string;
    notes: string | null;
    voidedBy: string;
    voidedAt: string;
  }>;
  recentAdjustments: Array<{
    id: string;
    medicineName: string;
    reason: string;
    quantityDelta: number;
    createdBy: string;
    createdAt: string;
  }>;
};

export type CreateSaleResponse = {
  id: string;
  saleNumber: string;
  totalAmount: number;
  paymentMethod: PaymentMethodValue;
  soldAt: string;
  items: Array<{
    medicineId: string;
    medicineName: string;
    quantity: number;
    batchNumber: string;
    unitPrice: number;
    lineTotal: number;
  }>;
};

export type DispensePrescriptionResponse = {
  prescription: PrescriptionRecord;
  sale: CreateSaleResponse;
};

export type ReportsSummaryResponse = {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  sales: {
    totalSalesAmount: number;
    completedSalesCount: number;
    averageTicket: number;
    totalUnitsSold: number;
    paymentBreakdown: Array<{
      method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER";
      amount: number;
      count: number;
    }>;
    dailySales: Array<{
      dayKey: string;
      label: string;
      date: string;
      value: number;
    }>;
    topMedicines: Array<{
      medicineId: string;
      name: string;
      quantitySold: number;
      revenue: number;
    }>;
    recentSales: Array<{
      id: string;
      saleNumber: string;
      soldBy: string;
      soldAt: string;
      paymentMethod: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER";
      itemCount: number;
      totalAmount: number;
    }>;
  };
  inventory: {
    totalInventoryValue: number;
    totalCostValue: number;
    totalUnitsOnHand: number;
    activeBatchCount: number;
    lowStockCount: number;
    nearExpiryBatchCount: number;
    lowStockMedicines: Array<{
      medicineId: string;
      name: string;
      quantityOnHand: number;
      nextExpiryDate: string | null;
      isExpiringSoon: boolean;
    }>;
  };
  adjustments: {
    totalAdjustments: number;
    positiveAdjustments: number;
    negativeAdjustments: number;
    suspectedLossCount: number;
    netUnitsDelta: number;
    reasonBreakdown: Array<{
      reason: AdjustmentReason;
      count: number;
    }>;
    recentLossEvents: Array<{
      id: string;
      medicineName: string;
      batchNumber: string;
      reason: AdjustmentReason;
      quantityDelta: number;
      createdBy: string;
      createdAt: string;
      notes: string | null;
    }>;
  };
};

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

function getStoredLocale() {
  if (typeof window === "undefined") {
    return "en";
  }

  return window.localStorage.getItem("pharmahub.locale") ?? "en";
}

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "x-pharmahub-locale": getStoredLocale(),
  };
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-pharmahub-locale": getStoredLocale(),
      ...(init?.headers ?? {}),
    },
  });

  const raw = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;

  if (!response.ok) {
    const msg = Array.isArray(raw?.message)
      ? raw?.message.join(", ")
      : raw?.message;
    throw new Error(msg ?? "Request failed.");
  }

  return raw as T;
}

export function formatError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
