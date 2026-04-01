import { Injectable, NotFoundException } from "@nestjs/common";
import { MovementType, Prisma } from "@prisma/client";
import { getIntlLocale, type AppLocale } from "../common/i18n/locale";
import { serializeAuditItem } from "../audit/audit.presenter";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";

const LOW_STOCK_THRESHOLD = 20;
const NEAR_EXPIRY_DAYS = 30;
const WEEK_DAYS = 7;

@Injectable()
export class DashboardService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getOverview(currentUser: AuthenticatedUser, locale: AppLocale = "en") {
    const branch = await this.resolveBranch(currentUser);
    const nearExpiryCutoff = this.getNearExpiryCutoff();
    const trendStart = this.getTrendStart();

    const [medicineCount, batches, recentActivity, trendMovements] =
      await Promise.all([
        this.prisma.medicine.count({
          where: {
            pharmacyId: currentUser.pharmacyId,
          },
        }),
        this.prisma.stockBatch.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
          },
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { expiryDate: "asc" },
            { receivedAt: "desc" },
          ],
        }),
        this.prisma.auditLog.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            OR: [
              { branchId: branch.id },
              { branchId: null },
            ],
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
          take: 6,
        }),
        this.prisma.stockMovement.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            movementType: MovementType.STOCK_IN,
            createdAt: {
              gte: trendStart,
            },
          },
          include: {
            stockBatch: {
              select: {
                sellingPrice: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        }),
      ]);

    const activeBatches = batches.filter((batch) => batch.quantityOnHand > 0);
    const quantityByMedicine = new Map<string, number>();

    for (const batch of activeBatches) {
      quantityByMedicine.set(
        batch.medicineId,
        (quantityByMedicine.get(batch.medicineId) ?? 0) + batch.quantityOnHand
      );
    }

    const lowStockCount = Array.from(quantityByMedicine.values()).filter(
      (quantity) => quantity <= LOW_STOCK_THRESHOLD
    ).length;
    const nearExpiryBatchCount = activeBatches.filter(
      (batch) => batch.expiryDate <= nearExpiryCutoff
    ).length;
    const totalInventoryValue = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand * this.toNumber(batch.sellingPrice),
      0
    );
    const totalUnitsOnHand = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand,
      0
    );

    const expiryItems = activeBatches
      .slice()
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
      .slice(0, 5)
      .map((batch) => ({
        id: batch.id,
        medicineName: batch.medicine.name,
        batchNumber: batch.batchNumber,
        stock: batch.quantityOnHand,
        expiryDate: batch.expiryDate,
        status: this.getExpiryStatus(batch.expiryDate),
      }));

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalInventoryValue: this.roundCurrency(totalInventoryValue),
        registeredMedicines: medicineCount,
        activeBatches: activeBatches.length,
        lowStockCount,
        nearExpiryBatchCount,
        criticalAlertCount: lowStockCount + nearExpiryBatchCount,
        totalUnitsOnHand,
      },
      weeklyInventoryValue: this.buildTrendSeries(trendMovements, locale),
      expiryItems,
      recentActivity: recentActivity.map((item) => serializeAuditItem(item, locale)),
    };
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

  private buildTrendSeries(
    movements: Array<{
      createdAt: Date;
      quantityDelta: number;
      stockBatch: { sellingPrice: Prisma.Decimal };
    }>,
    locale: AppLocale
  ) {
    const days = Array.from({ length: WEEK_DAYS }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (WEEK_DAYS - 1 - index));
      return date;
    });

    const totals = new Map<string, number>(
      days.map((date) => [this.toDayKey(date), 0])
    );

    for (const movement of movements) {
      const key = this.toDayKey(movement.createdAt);
      totals.set(
        key,
        (totals.get(key) ?? 0) +
          movement.quantityDelta * this.toNumber(movement.stockBatch.sellingPrice)
      );
    }

    return days.map((date) => ({
      dayKey: this.toDayKey(date),
      label: date
        .toLocaleDateString(getIntlLocale(locale), { weekday: "short" })
        .toUpperCase(),
      value: this.roundCurrency(totals.get(this.toDayKey(date)) ?? 0),
      date: date.toISOString(),
    }));
  }

  private getExpiryStatus(expiryDate: Date) {
    const diffInDays = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays <= 7) {
      return "CRITICAL";
    }

    if (diffInDays <= NEAR_EXPIRY_DAYS) {
      return "WARNING";
    }

    return "NORMAL";
  }

  private getNearExpiryCutoff() {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    return cutoff;
  }

  private getTrendStart() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (WEEK_DAYS - 1));
    return start;
  }

  private toDayKey(value: Date) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private toNumber(value: Prisma.Decimal | number) {
    return typeof value === "number" ? value : Number(value);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
