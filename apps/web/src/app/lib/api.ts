export const TOKEN_KEY = "pharmahub.accessToken";

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
    title: string;
    description: string;
    tone: "success" | "info" | "neutral" | "danger";
    createdAt: string;
  }>;
};

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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
