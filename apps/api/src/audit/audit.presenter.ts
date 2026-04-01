import { AdjustmentReason, AuditAction, Prisma } from "@prisma/client";
import type { AppLocale } from "../common/i18n/locale";

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

export function serializeAuditItem(
  activity: AuditRecord,
  locale: AppLocale = "en"
): SerializedAuditItem {
  const metadata = asRecord(activity.metadata);
  const actor = activity.user?.fullName ?? translateAudit(locale, "system");

  switch (activity.action) {
    case AuditAction.STOCK_BATCH_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: translateAudit(locale, "stockReceived.title"),
        description: translateAudit(locale, "stockReceived.description", {
          actor,
          quantity: metadata.quantity ?? translateAudit(locale, "newQuantity"),
          medicineName:
            metadata.medicineName ?? translateAudit(locale, "aMedicine"),
          batchNumber: metadata.batchNumber ?? translateAudit(locale, "notAvailable"),
        }),
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
          title: translateAudit(locale, "cycleCountCompleted.title"),
          description: translateAudit(locale, "cycleCountCompleted.description", {
            actor,
            medicineName,
            batchNumber,
            previousQuantity,
            countedQuantity,
          }),
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
        title: isLoss
          ? translateAudit(locale, "stockLossRecorded.title")
          : translateAudit(locale, "stockAdjusted.title"),
        description: translateAudit(locale, "stockAdjusted.description", {
          actor,
          quantity: quantity || translateAudit(locale, "aUnit"),
          reason,
          medicineName,
          batchNumber,
          quantityAfter,
        }),
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
        title: translateAudit(locale, "medicineCatalogUpdated.title"),
        description: translateAudit(locale, "medicineCatalogUpdated.description", {
          actor,
          name: metadata.name ?? translateAudit(locale, "aNewMedicine"),
        }),
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.USER_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Users",
        title: translateAudit(locale, "staffAccountAdded.title"),
        description: translateAudit(locale, "staffAccountAdded.description", {
          actor,
        }),
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.SALE_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Sales",
        title: translateAudit(locale, "saleCompleted.title"),
        description: translateAudit(locale, "saleCompleted.description", {
          actor,
          saleNumber: metadata.saleNumber ?? translateAudit(locale, "notAvailable"),
          totalAmount: metadata.totalAmount ?? "0.00",
        }),
        tone: "success",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.PURCHASE_ORDER_CREATED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: translateAudit(locale, "purchaseOrderCreated.title"),
        description: translateAudit(locale, "purchaseOrderCreated.description", {
          actor,
          orderNumber:
            metadata.orderNumber ?? translateAudit(locale, "aPurchaseOrder"),
          supplierName:
            metadata.supplierName ?? translateAudit(locale, "aSupplier"),
        }),
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.PURCHASE_ORDER_RECEIVED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Inventory",
        title: translateAudit(locale, "purchaseOrderReceived.title"),
        description: translateAudit(locale, "purchaseOrderReceived.description", {
          actor,
          totalReceivedQuantity:
            metadata.totalReceivedQuantity ?? translateAudit(locale, "newQuantity"),
          orderNumber:
            metadata.orderNumber ?? translateAudit(locale, "aPurchaseOrder"),
          supplierName:
            metadata.supplierName ?? translateAudit(locale, "aSupplier"),
        }),
        tone:
          metadata.status === "RECEIVED"
            ? "success"
            : "info",
        actor,
        createdAt: activity.createdAt,
      };
    case "PRESCRIPTION_CREATED":
      return {
        id: activity.id,
        action: activity.action,
        category: "Sales",
        title: translateAudit(locale, "prescriptionReceived.title"),
        description: translateAudit(locale, "prescriptionReceived.description", {
          actor,
          prescriptionNumber:
            metadata.prescriptionNumber ?? translateAudit(locale, "notAvailable"),
          patientName: metadata.patientName ?? translateAudit(locale, "aPatient"),
        }),
        tone: "info",
        actor,
        createdAt: activity.createdAt,
      };
    case "PRESCRIPTION_STATUS_UPDATED":
      return {
        id: activity.id,
        action: activity.action,
        category: "Sales",
        title: translateAudit(locale, "prescriptionStatusUpdated.title"),
        description: translateAudit(locale, "prescriptionStatusUpdated.description", {
          actor,
          prescriptionNumber:
            metadata.prescriptionNumber ?? translateAudit(locale, "notAvailable"),
          patientName: metadata.patientName ?? translateAudit(locale, "aPatient"),
          status: formatReason(metadata.status),
        }),
        tone:
          metadata.status === "DISPENSED"
            ? "success"
            : metadata.status === "CANCELLED"
              ? "warning"
              : "info",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.LOGIN_SUCCESS:
      return {
        id: activity.id,
        action: activity.action,
        category: "Access",
        title: translateAudit(locale, "staffLogin.title"),
        description: translateAudit(locale, "staffLogin.description", {
          actor,
        }),
        tone: "neutral",
        actor,
        createdAt: activity.createdAt,
      };
    case AuditAction.LOGIN_FAILED:
      return {
        id: activity.id,
        action: activity.action,
        category: "Access",
        title: translateAudit(locale, "failedLoginAttempt.title"),
        description: translateAudit(locale, "failedLoginAttempt.description", {
          actor,
        }),
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
        description: translateAudit(locale, "genericEvent.description", {
          actor,
          entityType: activity.entityType.toLowerCase(),
        }),
        tone: "neutral",
        actor,
        createdAt: activity.createdAt,
      };
  }
}

function asRecord(
  value: Prisma.JsonValue | null
): Record<string, string | number | boolean> {
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

const AUDIT_MESSAGES: Record<AppLocale, Record<string, string>> = {
  en: {
    system: "System",
    notAvailable: "N/A",
    aMedicine: "a medicine",
    aNewMedicine: "a new medicine",
    aPatient: "a patient",
    aPurchaseOrder: "a purchase order",
    aSupplier: "a supplier",
    aUnit: "a",
    newQuantity: "new",
    "stockReceived.title": "Stock received",
    "stockReceived.description":
      "{actor} added {quantity} units for {medicineName} batch {batchNumber}.",
    "cycleCountCompleted.title": "Cycle count completed",
    "cycleCountCompleted.description":
      "{actor} counted {medicineName} batch {batchNumber}: system {previousQuantity}, counted {countedQuantity}.",
    "stockLossRecorded.title": "Stock loss recorded",
    "stockAdjusted.title": "Stock adjusted",
    "stockAdjusted.description":
      "{actor} recorded {quantity} unit {reason} adjustment for {medicineName} batch {batchNumber}. Remaining stock: {quantityAfter}.",
    "medicineCatalogUpdated.title": "Medicine catalog updated",
    "medicineCatalogUpdated.description":
      "{actor} added {name} to the catalog.",
    "staffAccountAdded.title": "Staff account added",
    "staffAccountAdded.description":
      "{actor} created a new team account.",
    "saleCompleted.title": "Sale completed",
    "saleCompleted.description":
      "{actor} completed sale {saleNumber} for ETB {totalAmount}.",
    "purchaseOrderCreated.title": "Purchase order created",
    "purchaseOrderCreated.description":
      "{actor} raised {orderNumber} for {supplierName}.",
    "purchaseOrderReceived.title": "Purchase order received",
    "purchaseOrderReceived.description":
      "{actor} received {totalReceivedQuantity} units for {orderNumber} from {supplierName}.",
    "prescriptionReceived.title": "Prescription received",
    "prescriptionReceived.description":
      "{actor} logged prescription {prescriptionNumber} for {patientName}.",
    "prescriptionStatusUpdated.title": "Prescription updated",
    "prescriptionStatusUpdated.description":
      "{actor} moved prescription {prescriptionNumber} for {patientName} to {status}.",
    "staffLogin.title": "Staff login",
    "staffLogin.description": "{actor} signed in successfully.",
    "failedLoginAttempt.title": "Failed login attempt",
    "failedLoginAttempt.description":
      "A login attempt for {actor} was rejected.",
    "genericEvent.description":
      "{actor} recorded a {entityType} event.",
  },
  am: {
    system: "ሲስተም",
    notAvailable: "የለም",
    aMedicine: "አንድ መድሃኒት",
    aNewMedicine: "አዲስ መድሃኒት",
    aPatient: "ታካሚ",
    aPurchaseOrder: "የግዥ ትዕዛዝ",
    aSupplier: "አቅራቢ",
    aUnit: "አንድ",
    newQuantity: "አዲስ",
    "stockReceived.title": "እቃ ተቀብሏል",
    "stockReceived.description":
      "{actor} ለ {medicineName} ባች {batchNumber} {quantity} ዩኒቶችን ጨምሯል።",
    "cycleCountCompleted.title": "የእቃ ቆጠራ ተጠናቋል",
    "cycleCountCompleted.description":
      "{actor} {medicineName} ባች {batchNumber} ቆጥሯል፦ ሲስተም {previousQuantity}፣ የተቆጠረ {countedQuantity}።",
    "stockLossRecorded.title": "የእቃ ጉድለት ተመዝግቧል",
    "stockAdjusted.title": "እቃ ተስተካክሏል",
    "stockAdjusted.description":
      "{actor} ለ {medicineName} ባች {batchNumber} {quantity} ዩኒት {reason} ማስተካከያ መዝግቧል። የቀረው እቃ፦ {quantityAfter}።",
    "medicineCatalogUpdated.title": "የመድሃኒት ካታሎግ ተዘምኗል",
    "medicineCatalogUpdated.description":
      "{actor} {name} ወደ ካታሎጉ ጨምሯል።",
    "staffAccountAdded.title": "የሰራተኛ መለያ ተጨምሯል",
    "staffAccountAdded.description":
      "{actor} አዲስ የቡድን መለያ ፈጥሯል።",
    "saleCompleted.title": "ሽያጭ ተጠናቋል",
    "saleCompleted.description":
      "{actor} ሽያጭ {saleNumber} በ ETB {totalAmount} አጠናቋል።",
    "purchaseOrderCreated.title": "የግዥ ትዕዛዝ ተፈጥሯል",
    "purchaseOrderCreated.description":
      "{actor} {orderNumber} ለ {supplierName} አነሳ።",
    "purchaseOrderReceived.title": "የግዥ ትዕዛዝ ተቀብሏል",
    "purchaseOrderReceived.description":
      "{actor} {totalReceivedQuantity} ዩኒቶችን ለ {orderNumber} ከ {supplierName} ተቀብሏል።",
    "prescriptionReceived.title": "የሀኪም ትዕዛዝ ተቀብሏል",
    "prescriptionReceived.description":
      "{actor} ለ {patientName} ትዕዛዝ {prescriptionNumber} መዝግቧል።",
    "prescriptionStatusUpdated.title": "የሀኪም ትዕዛዝ ተዘምኗል",
    "prescriptionStatusUpdated.description":
      "{actor} ለ {patientName} ትዕዛዝ {prescriptionNumber}ን ወደ {status} አንቀሳቅሷል።",
    "staffLogin.title": "የሰራተኛ መግቢያ",
    "staffLogin.description": "{actor} በተሳካ ሁኔታ ገብቷል።",
    "failedLoginAttempt.title": "ያልተሳካ የመግቢያ ሙከራ",
    "failedLoginAttempt.description":
      "ለ {actor} የተደረገ የመግቢያ ሙከራ ተቀባይነት አላገኘም።",
    "genericEvent.description":
      "{actor} የ {entityType} ክስተት መዝግቧል።",
  },
  om: {
    system: "Sirna",
    notAvailable: "Hin jiru",
    aMedicine: "qoricha tokko",
    aNewMedicine: "qoricha haaraa",
    aPatient: "dhukkubsataa",
    aPurchaseOrder: "ajaja bittaa",
    aSupplier: "dhiyeessaa",
    aUnit: "tokko",
    newQuantity: "haaraa",
    "stockReceived.title": "Kuusaan fudhatame",
    "stockReceived.description":
      "{actor} {medicineName} baachii {batchNumber}f yuunitii {quantity} dabaleera.",
    "cycleCountCompleted.title": "Lakkoofsi kuusaa xumurame",
    "cycleCountCompleted.description":
      "{actor} {medicineName} baachii {batchNumber} lakkaa'eera: sirni {previousQuantity}, lakkaa'ame {countedQuantity}.",
    "stockLossRecorded.title": "Badiinsi kuusaa galmaa'eera",
    "stockAdjusted.title": "Kuusaan sirreeffameera",
    "stockAdjusted.description":
      "{actor} {medicineName} baachii {batchNumber}f sirreeffama {reason} yuunitii {quantity} galmeesseera. Kuusaan hafe: {quantityAfter}.",
    "medicineCatalogUpdated.title": "Kaataalogiin qorichaa haaromfameera",
    "medicineCatalogUpdated.description":
      "{actor} {name} gara kaataalogii dabalteera.",
    "staffAccountAdded.title": "Herregni hojjetaa dabalameera",
    "staffAccountAdded.description":
      "{actor} herrega garee haaraa uumteera.",
    "saleCompleted.title": "Gurgurtaan xumurameera",
    "saleCompleted.description":
      "{actor} gurgurtaa {saleNumber} ETB {totalAmount}n xumurteera.",
    "purchaseOrderCreated.title": "Ajajni bittaa uumameera",
    "purchaseOrderCreated.description":
      "{actor} {orderNumber} {supplierName}f kaasteera.",
    "purchaseOrderReceived.title": "Ajajni bittaa fudhatameera",
    "purchaseOrderReceived.description":
      "{actor} yuunitii {totalReceivedQuantity} {orderNumber}f {supplierName} irraa fudhateera.",
    "prescriptionReceived.title": "Ajajni qorichaa galmaa'eera",
    "prescriptionReceived.description":
      "{actor} {patientName}f ajaja {prescriptionNumber} galmeesseera.",
    "prescriptionStatusUpdated.title": "Haalli ajaja qorichaa jijjiirameera",
    "prescriptionStatusUpdated.description":
      "{actor} ajaja {prescriptionNumber} kan {patientName} gara {status}tti jijjiireera.",
    "staffLogin.title": "Seensa hojjetaa",
    "staffLogin.description": "{actor} milkaa'inaan seeneera.",
    "failedLoginAttempt.title": "Yaaliin seensaa kufe",
    "failedLoginAttempt.description":
      "Yaaliin seensaa {actor}f taasifame ni didame.",
    "genericEvent.description":
      "{actor} taatee {entityType} galmeesseera.",
  },
};

function translateAudit(
  locale: AppLocale,
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>
) {
  const template = AUDIT_MESSAGES[locale][key] ?? AUDIT_MESSAGES.en[key] ?? key;

  if (!params) {
    return template;
  }

  return Object.entries(params).reduce(
    (result, [param, value]) =>
      result.replaceAll(`{${param}}`, String(value)),
    template
  );
}
