import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";

const LOW_STOCK_THRESHOLD = 20;
const CRITICAL_LOW_STOCK_THRESHOLD = 5;
const NEAR_EXPIRY_DAYS = 30;
const CRITICAL_EXPIRY_DAYS = 7;
const SIGNAL_WINDOW_DAYS = 14;

type AlertSeverity = "CRITICAL" | "WARNING";

type AuditMetadata = Record<string, Prisma.JsonValue>;

@Injectable()
export class AlertsService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getOverview(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const nearExpiryCutoff = this.getNearExpiryCutoff();
    const signalWindowStart = this.getSignalWindowStart();

    const [medicines, logs] = await Promise.all([
      this.prisma.medicine.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
        },
        include: {
          stockBatches: {
            where: {
              branchId: branch.id,
            },
            orderBy: [
              { expiryDate: "asc" },
              { receivedAt: "desc" },
              { createdAt: "desc" },
            ],
          },
        },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.auditLog.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          action: {
            in: [AuditAction.STOCK_ADJUSTED, AuditAction.SALE_VOIDED],
          },
          createdAt: {
            gte: signalWindowStart,
          },
        },
        include: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 40,
      }),
    ]);

    const lowStockMedicines = medicines
      .filter((medicine) => medicine.stockBatches.length > 0)
      .map((medicine) => {
        const activeBatches = medicine.stockBatches.filter(
          (batch) => batch.quantityOnHand > 0
        );
        const totalQuantityOnHand = activeBatches.reduce(
          (sum, batch) => sum + batch.quantityOnHand,
          0
        );
        const totalStockValue = activeBatches.reduce(
          (sum, batch) =>
            sum + batch.quantityOnHand * this.toNumber(batch.sellingPrice),
          0
        );
        const nextBatch = activeBatches[0] ?? medicine.stockBatches[0] ?? null;

        return {
          id: medicine.id,
          name: medicine.name,
          genericName: medicine.genericName,
          form: medicine.form,
          strength: medicine.strength,
          unit: medicine.unit,
          totalQuantityOnHand,
          activeBatchCount: activeBatches.length,
          totalStockValue: this.roundCurrency(totalStockValue),
          currentBatchNumber: nextBatch?.batchNumber ?? null,
          nextExpiryDate: nextBatch?.expiryDate ?? null,
          status:
            totalQuantityOnHand <= CRITICAL_LOW_STOCK_THRESHOLD
              ? ("CRITICAL" as const)
              : ("WARNING" as const),
        };
      })
      .filter((medicine) => medicine.totalQuantityOnHand <= LOW_STOCK_THRESHOLD)
      .slice(0, 12);

    const expiryBatches = medicines
      .flatMap((medicine) =>
        medicine.stockBatches
          .filter(
            (batch) =>
              batch.quantityOnHand > 0 && batch.expiryDate <= nearExpiryCutoff
          )
          .map((batch) => {
            const daysUntilExpiry = this.getDaysUntil(batch.expiryDate);
            const status = this.getExpiryStatus(daysUntilExpiry);

            return {
              id: batch.id,
              medicineId: medicine.id,
              medicineName: medicine.name,
              genericName: medicine.genericName,
              batchNumber: batch.batchNumber,
              quantityOnHand: batch.quantityOnHand,
              sellingPrice: this.toNumber(batch.sellingPrice),
              supplierName: batch.supplierName,
              expiryDate: batch.expiryDate,
              receivedAt: batch.receivedAt,
              daysUntilExpiry,
              status,
            };
          })
      )
      .sort((left, right) => left.expiryDate.getTime() - right.expiryDate.getTime())
      .slice(0, 12);

    const inventorySignals = logs
      .map((log) => {
        if (log.action !== AuditAction.STOCK_ADJUSTED) {
          return null;
        }

        const metadata = this.asAuditMetadata(log.metadata);
        const quantityDelta = this.toNumber(metadata.quantityDelta);
        const medicineName = String(metadata.medicineName ?? "Unknown medicine");
        const batchNumber = String(metadata.batchNumber ?? "N/A");
        const actor = log.user?.fullName ?? "System";

        if (
          metadata.source === "cycle_count" &&
          quantityDelta < 0
        ) {
          return {
            id: log.id,
            type: "COUNT_SHORTAGE" as const,
            severity: "WARNING" as const,
            title: "Cycle count shortage",
            description: `${actor} counted ${medicineName} batch ${batchNumber} at ${this.toNumber(
              metadata.countedQuantity
            )} units, ${Math.abs(quantityDelta)} below system stock.`,
            medicineName,
            batchNumber,
            quantityDelta,
            actor,
            createdAt: log.createdAt,
          };
        }

        const reason = String(metadata.reason ?? "");

        if (reason === "THEFT_SUSPECTED" || reason === "LOST") {
          return {
            id: log.id,
            type: reason as "THEFT_SUSPECTED" | "LOST",
            severity: "CRITICAL" as const,
            title:
              reason === "THEFT_SUSPECTED"
                ? "Suspicious stock loss"
                : "Stock loss recorded",
            description: `${actor} recorded ${Math.abs(quantityDelta)} missing units for ${medicineName} batch ${batchNumber}.`,
            medicineName,
            batchNumber,
            quantityDelta,
            actor,
            createdAt: log.createdAt,
          };
        }

        return null;
      })
      .filter((signal) => signal !== null)
      .slice(0, 10);

    const salesSignals = logs
      .map((log) => {
        if (log.action !== AuditAction.SALE_VOIDED) {
          return null;
        }

        const metadata = this.asAuditMetadata(log.metadata);
        const actor = log.user?.fullName ?? "System";

        return {
          id: log.id,
          type: "SALE_VOIDED" as const,
          severity: "WARNING" as const,
          title: "Sale reversed",
          description: `${actor} voided sale ${String(
            metadata.saleNumber ?? "N/A"
          )}${metadata.reason ? ` for ${String(metadata.reason)}` : ""}.`,
          saleNumber: String(metadata.saleNumber ?? "N/A"),
          reason:
            typeof metadata.reason === "string" ? metadata.reason : null,
          totalAmount: this.toNullableNumber(metadata.totalAmount),
          actor,
          createdAt: log.createdAt,
        };
      })
      .filter((signal) => signal !== null)
      .slice(0, 8);

    const lowStockCriticalCount = lowStockMedicines.filter(
      (medicine) => medicine.status === "CRITICAL"
    ).length;
    const lowStockWarningCount = lowStockMedicines.filter(
      (medicine) => medicine.status === "WARNING"
    ).length;
    const expiredCount = expiryBatches.filter(
      (batch) => batch.status === "EXPIRED"
    ).length;
    const criticalExpiryCount = expiryBatches.filter(
      (batch) => batch.status === "CRITICAL"
    ).length;
    const warningExpiryCount = expiryBatches.filter(
      (batch) => batch.status === "WARNING"
    ).length;
    const suspectedLossCount = inventorySignals.filter(
      (signal) => signal.type === "THEFT_SUSPECTED" || signal.type === "LOST"
    ).length;
    const cycleCountShortageCount = inventorySignals.filter(
      (signal) => signal.type === "COUNT_SHORTAGE"
    ).length;

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalAlerts:
          lowStockMedicines.length +
          expiryBatches.length +
          inventorySignals.length +
          salesSignals.length,
        criticalAlerts:
          lowStockCriticalCount + expiredCount + criticalExpiryCount + suspectedLossCount,
        warningAlerts:
          lowStockWarningCount +
          warningExpiryCount +
          cycleCountShortageCount +
          salesSignals.length,
        lowStockCount: lowStockMedicines.length,
        expiringSoonCount: expiryBatches.length,
        expiredCount,
        suspectedLossCount,
        cycleCountShortageCount,
        voidedSaleCount: salesSignals.length,
      },
      lowStockMedicines,
      expiryBatches,
      inventorySignals,
      salesSignals,
    };
  }

  private asAuditMetadata(value: Prisma.JsonValue | null): AuditMetadata {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as AuditMetadata;
  }

  private getDaysUntil(value: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(value);
    target.setHours(0, 0, 0, 0);

    return Math.ceil(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  private getExpiryStatus(daysUntilExpiry: number) {
    if (daysUntilExpiry < 0) {
      return "EXPIRED" as const;
    }

    if (daysUntilExpiry <= CRITICAL_EXPIRY_DAYS) {
      return "CRITICAL" as const;
    }

    return "WARNING" as const;
  }

  private getNearExpiryCutoff() {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    return cutoff;
  }

  private getSignalWindowStart() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - SIGNAL_WINDOW_DAYS);
    return start;
  }

  private async resolveBranch(currentUser: AuthenticatedUser) {
    if (currentUser.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: currentUser.branchId,
          pharmacyId: currentUser.pharmacyId,
        },
      });

      if (branch) {
        return branch;
      }
    }

    const defaultBranch = await this.prisma.branch.findFirst({
      where: {
        pharmacyId: currentUser.pharmacyId,
        isDefault: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!defaultBranch) {
      throw new NotFoundException("No branch is configured for this pharmacy.");
    }

    return defaultBranch;
  }

  private toNumber(value: Prisma.Decimal | Prisma.JsonValue | null | undefined) {
    if (typeof value === "number") {
      return value;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private toNullableNumber(
    value: Prisma.Decimal | Prisma.JsonValue | null | undefined
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
