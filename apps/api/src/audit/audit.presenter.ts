import { AdjustmentReason, AuditAction, Prisma } from "@prisma/client";

type AuditUser = {
  fullName: string;
} | null;

type AuditRecord = {
  id: string;
  action: AuditAction;
  entityType: string;
  createdAt: Date;
  metadata: Prisma.JsonValue | null;
  user: AuditUser;
};

type ActivityTone = "success" | "info" | "neutral" | "danger" | "warning";
type ActivityCategory = "Inventory" | "Sales" | "Access" | "Users" | "Catalog";

export type SerializedAuditItem = {
  id: string;
  action: AuditAction;
  category: ActivityCategory;
  title: string;
  description: string;
  tone: ActivityTone;
  actor: string;
  createdAt: Date;
};

export function serializeAuditItem(activity: AuditRecord): SerializedAuditItem {
  const metadata = asRecord(activity.metadata);
  const actor = activity.user?.fullName ?? "System";

  switch (activity.action) {
    case AuditAction.STOCK_BATCH_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: "Stock received",
        description: `${actor} added ${
          metadata.quantity ?? "new"
        } units for ${metadata.medicineName ?? "a medicine"} batch ${
          metadata.batchNumber ?? "N/A"
        }.`,
        tone: "success",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.STOCK_ADJUSTED: {
      const quantityDelta = toNumber(metadata.quantityDelta);
      const quantity = Math.abs(quantityDelta);
      const reason = formatReason(metadata.reason);
      const medicineName = metadata.medicineName ?? "a medicine";
      const batchNumber = metadata.batchNumber ?? "N/A";
      const quantityAfter = metadata.quantityAfter ?? "unknown";
      const isCycleCount = metadata.source === "cycle_count";
      const isLoss =
        quantityDelta < 0 &&
        ["LOST", "THEFT_SUSPECTED"].includes(String(metadata.reason ?? ""));

      if (isCycleCount) {
        const previousQuantity = metadata.previousQuantity ?? "unknown";
        const countedQuantity = metadata.countedQuantity ?? quantityAfter;

        return {
          id: activity.id,
          action: activity.action,
          category: "Inventory",
          title: "Cycle count completed",
          description: `${actor} counted ${medicineName} batch ${batchNumber}: system ${previousQuantity}, counted ${countedQuantity}.`,
          tone:
            quantityDelta === 0
              ? "success"
              : quantityDelta < 0
                ? "warning"
                : "info",
          actor,
          createdAt: activity.createdAt,
        };
      }

      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: isLoss ? "Stock loss recorded" : "Stock adjusted",
        description: `${actor} recorded ${
          quantity || "a"
        } unit ${reason} adjustment for ${medicineName} batch ${batchNumber}. Remaining stock: ${quantityAfter}.`,
        tone: isLoss ? "danger" : quantityDelta < 0 ? "warning" : "info",
        actor,
        createdAt: activity.createdAt,
      };
    }
    case AuditAction.MEDICINE_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Catalog",
        title: "Medicine catalog updated",
        description: `${actor} added ${metadata.name ?? "a new medicine"} to the catalog.`,
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.USER_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Users",
        title: "Staff account added",
        description: `${actor} created a new team account.`,
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.SALE_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Sales",
        title: "Sale completed",
        description: `${actor} completed sale ${
          metadata.saleNumber ?? "N/A"
        } for ETB ${metadata.totalAmount ?? "0.00"}.`,
        tone: "success",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.PURCHASE_ORDER_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: "Purchase order created",
        description: `${actor} raised ${metadata.orderNumber ?? "a purchase order"} for ${
          metadata.supplierName ?? "a supplier"
        }.`,
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.PURCHASE_ORDER_RECEIVED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: "Purchase order received",
        description: `${actor} received ${
          metadata.totalReceivedQuantity ?? "new"
        } units for ${metadata.orderNumber ?? "a purchase order"} from ${
          metadata.supplierName ?? "a supplier"
        }.`,
        tone:
          metadata.status === "RECEIVED"
            ? "success"
            : "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.LOGIN_SUCCESS:
      return {
        id: activity.id,
        action: activity.action,
        category: "Access",
        title: "Staff login",
        description: `${actor} signed in successfully.`,
        tone: "neutral",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.LOGIN_FAILED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Access",
        title: "Failed login attempt",
        description: `A login attempt for ${actor} was rejected.`,
        tone: "danger",
        actor,
        createdAt: activity.createdAt,
      };
    default:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: activity.action.replaceAll("_", " "),
        description: `${actor} recorded a ${activity.entityType.toLowerCase()} event.`,
        tone: "neutral",
        actor,
        createdAt: activity.createdAt,
      };
  }
}

function asRecord(value: Prisma.JsonValue | null): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, string | number | boolean>;
}

function formatReason(value: unknown) {
  const reason = String(value ?? AdjustmentReason.OTHER);
  return reason.replaceAll("_", " ").toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
