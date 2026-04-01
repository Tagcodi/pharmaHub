import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AdjustmentReason,
  PaymentMethod,
  Prisma,
  SaleStatus,
} from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import type { ReportRangeDto } from "./dto/report-range.dto";

const DEFAULT_RANGE_DAYS = 30;
const LOW_STOCK_THRESHOLD = 20;
const NEAR_EXPIRY_DAYS = 30;
const MAX_RECENT_ITEMS = 8;

@Injectable()
export class ReportsService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getSummary(currentUser: AuthenticatedUser, query: ReportRangeDto) {
    const branch = await this.resolveBranch(currentUser);
    const rangeDays = this.normalizeRangeDays(query.rangeDays);
    const startDate = this.getRangeStart(rangeDays);
    const endDate = new Date();
    const nearExpiryCutoff = this.getNearExpiryCutoff();

    const [batches, sales, adjustments] = await Promise.all([
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
        orderBy: [{ expiryDate: "asc" }, { receivedAt: "desc" }],
      }),
      this.prisma.sale.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          status: SaleStatus.COMPLETED,
          soldAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          soldBy: {
            select: {
              fullName: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
        orderBy: {
          soldAt: "desc",
        },
      }),
      this.prisma.inventoryAdjustment.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
            },
          },
          stockBatch: {
            select: {
              batchNumber: true,
              expiryDate: true,
            },
          },
          createdBy: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const activeBatches = batches.filter((batch) => batch.quantityOnHand > 0);
    const quantityByMedicine = new Map<string, number>();
    const lowStockMedicineMap = new Map<
      string,
      {
        medicineId: string;
        name: string;
        quantityOnHand: number;
        nextExpiryDate: Date | null;
        isExpiringSoon: boolean;
      }
    >();

    for (const batch of activeBatches) {
      const runningQuantity =
        (quantityByMedicine.get(batch.medicineId) ?? 0) + batch.quantityOnHand;
      quantityByMedicine.set(batch.medicineId, runningQuantity);

      const existing = lowStockMedicineMap.get(batch.medicineId);
      const nextExpiryDate =
        !existing || (existing.nextExpiryDate && batch.expiryDate < existing.nextExpiryDate)
          ? batch.expiryDate
          : existing?.nextExpiryDate ?? batch.expiryDate;

      lowStockMedicineMap.set(batch.medicineId, {
        medicineId: batch.medicineId,
        name: batch.medicine.name,
        quantityOnHand: runningQuantity,
        nextExpiryDate,
        isExpiringSoon: nextExpiryDate <= nearExpiryCutoff,
      });
    }

    const totalInventoryValue = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand * this.toNumber(batch.sellingPrice),
      0
    );
    const totalCostValue = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand * this.toNumber(batch.costPrice),
      0
    );
    const totalUnitsOnHand = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand,
      0
    );
    const lowStockCount = Array.from(quantityByMedicine.values()).filter(
      (quantity) => quantity <= LOW_STOCK_THRESHOLD
    ).length;
    const nearExpiryBatchCount = activeBatches.filter(
      (batch) => batch.expiryDate <= nearExpiryCutoff
    ).length;

    const totalSalesAmount = sales.reduce(
      (sum, sale) => sum + this.toNumber(sale.totalAmount),
      0
    );
    const totalUnitsSold = sales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((lineSum, item) => lineSum + item.quantity, 0),
      0
    );

    const paymentBreakdown = Object.values(PaymentMethod).map((method) => {
      const matchingSales = sales.filter((sale) => sale.paymentMethod === method);
      const amount = matchingSales.reduce(
        (sum, sale) => sum + this.toNumber(sale.totalAmount),
        0
      );

      return {
        method,
        amount: this.roundCurrency(amount),
        count: matchingSales.length,
      };
    });

    const medicineSalesMap = new Map<
      string,
      { medicineId: string; name: string; quantitySold: number; revenue: number }
    >();

    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = medicineSalesMap.get(item.medicineId);
        const lineTotal = this.toNumber(item.lineTotal);

        medicineSalesMap.set(item.medicineId, {
          medicineId: item.medicineId,
          name: item.medicine.name,
          quantitySold: (existing?.quantitySold ?? 0) + item.quantity,
          revenue: (existing?.revenue ?? 0) + lineTotal,
        });
      }
    }

    const dailySales = this.buildDailySalesSeries(rangeDays, sales);

    const reasonBreakdown = Object.values(AdjustmentReason)
      .map((reason) => ({
        reason,
        count: adjustments.filter((adjustment) => adjustment.reason === reason).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      range: {
        days: rangeDays,
        startDate,
        endDate,
      },
      sales: {
        totalSalesAmount: this.roundCurrency(totalSalesAmount),
        completedSalesCount: sales.length,
        averageTicket:
          sales.length > 0
            ? this.roundCurrency(totalSalesAmount / sales.length)
            : 0,
        totalUnitsSold,
        paymentBreakdown,
        dailySales,
        topMedicines: Array.from(medicineSalesMap.values())
          .sort((a, b) => b.revenue - a.revenue || b.quantitySold - a.quantitySold)
          .slice(0, 5)
          .map((item) => ({
            ...item,
            revenue: this.roundCurrency(item.revenue),
          })),
        recentSales: sales.slice(0, MAX_RECENT_ITEMS).map((sale) => ({
          id: sale.id,
          saleNumber: sale.saleNumber,
          soldBy: sale.soldBy.fullName,
          soldAt: sale.soldAt,
          paymentMethod: sale.paymentMethod,
          itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
          totalAmount: this.roundCurrency(this.toNumber(sale.totalAmount)),
        })),
      },
      inventory: {
        totalInventoryValue: this.roundCurrency(totalInventoryValue),
        totalCostValue: this.roundCurrency(totalCostValue),
        totalUnitsOnHand,
        activeBatchCount: activeBatches.length,
        lowStockCount,
        nearExpiryBatchCount,
        lowStockMedicines: Array.from(lowStockMedicineMap.values())
          .filter((medicine) => medicine.quantityOnHand <= LOW_STOCK_THRESHOLD)
          .sort((a, b) => a.quantityOnHand - b.quantityOnHand || a.name.localeCompare(b.name))
          .slice(0, 6)
          .map((medicine) => ({
            ...medicine,
            nextExpiryDate: medicine.nextExpiryDate,
          })),
      },
      adjustments: {
        totalAdjustments: adjustments.length,
        positiveAdjustments: adjustments.filter((adjustment) => adjustment.quantityDelta > 0)
          .length,
        negativeAdjustments: adjustments.filter((adjustment) => adjustment.quantityDelta < 0)
          .length,
        suspectedLossCount: adjustments.filter(
          (adjustment) =>
            adjustment.reason === AdjustmentReason.LOST ||
            adjustment.reason === AdjustmentReason.THEFT_SUSPECTED
        ).length,
        netUnitsDelta: adjustments.reduce(
          (sum, adjustment) => sum + adjustment.quantityDelta,
          0
        ),
        reasonBreakdown,
        recentLossEvents: adjustments
          .filter(
            (adjustment) =>
              adjustment.reason === AdjustmentReason.LOST ||
              adjustment.reason === AdjustmentReason.THEFT_SUSPECTED
          )
          .slice(0, 6)
          .map((adjustment) => ({
            id: adjustment.id,
            medicineName: adjustment.medicine.name,
            batchNumber: adjustment.stockBatch.batchNumber,
            reason: adjustment.reason,
            quantityDelta: adjustment.quantityDelta,
            createdBy: adjustment.createdBy.fullName,
            createdAt: adjustment.createdAt,
            notes: adjustment.notes,
          })),
      },
    };
  }

  async exportCsv(currentUser: AuthenticatedUser, query: ReportRangeDto) {
    const summary = await this.getSummary(currentUser, query);
    const rows: string[][] = [];

    rows.push(["PharmaHub Report"]);
    rows.push(["Branch", summary.branch.name]);
    rows.push(["Range Days", String(summary.range.days)]);
    rows.push(["Start Date", summary.range.startDate.toISOString()]);
    rows.push(["End Date", summary.range.endDate.toISOString()]);
    rows.push([]);

    rows.push(["Section", "Metric", "Value"]);
    rows.push(["Sales", "Total sales amount", String(summary.sales.totalSalesAmount)]);
    rows.push(["Sales", "Completed sales count", String(summary.sales.completedSalesCount)]);
    rows.push(["Sales", "Average ticket", String(summary.sales.averageTicket)]);
    rows.push(["Sales", "Units sold", String(summary.sales.totalUnitsSold)]);
    rows.push(["Inventory", "Inventory value", String(summary.inventory.totalInventoryValue)]);
    rows.push(["Inventory", "Cost value", String(summary.inventory.totalCostValue)]);
    rows.push(["Inventory", "Units on hand", String(summary.inventory.totalUnitsOnHand)]);
    rows.push(["Inventory", "Low stock medicines", String(summary.inventory.lowStockCount)]);
    rows.push(["Inventory", "Near expiry batches", String(summary.inventory.nearExpiryBatchCount)]);
    rows.push(["Adjustments", "Total adjustments", String(summary.adjustments.totalAdjustments)]);
    rows.push(["Adjustments", "Suspected loss count", String(summary.adjustments.suspectedLossCount)]);
    rows.push(["Adjustments", "Net units delta", String(summary.adjustments.netUnitsDelta)]);
    rows.push([]);

    rows.push(["Payment Method", "Sales Count", "Amount"]);
    for (const item of summary.sales.paymentBreakdown) {
      rows.push([item.method, String(item.count), String(item.amount)]);
    }
    rows.push([]);

    rows.push(["Top Medicines"]);
    rows.push(["Medicine", "Units Sold", "Revenue"]);
    for (const item of summary.sales.topMedicines) {
      rows.push([item.name, String(item.quantitySold), String(item.revenue)]);
    }
    rows.push([]);

    rows.push(["Recent Loss Events"]);
    rows.push(["Created At", "Medicine", "Batch", "Reason", "Quantity Delta", "Created By", "Notes"]);
    for (const item of summary.adjustments.recentLossEvents) {
      rows.push([
        item.createdAt.toISOString(),
        item.medicineName,
        item.batchNumber,
        item.reason,
        String(item.quantityDelta),
        item.createdBy,
        item.notes ?? "",
      ]);
    }
    rows.push([]);

    rows.push(["Recent Sales"]);
    rows.push(["Sold At", "Sale Number", "Sold By", "Items", "Payment Method", "Total Amount"]);
    for (const item of summary.sales.recentSales) {
      rows.push([
        item.soldAt.toISOString(),
        item.saleNumber,
        item.soldBy,
        String(item.itemCount),
        item.paymentMethod,
        String(item.totalAmount),
      ]);
    }

    return rows.map((row) => row.map((value) => this.escapeCsv(value)).join(",")).join("\n");
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

  private buildDailySalesSeries(
    rangeDays: number,
    sales: Array<{
      soldAt: Date;
      totalAmount: Prisma.Decimal;
    }>
  ) {
    const days = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (rangeDays - 1 - index));
      return date;
    });

    const totals = new Map<string, number>(days.map((date) => [this.toDayKey(date), 0]));

    for (const sale of sales) {
      const key = this.toDayKey(sale.soldAt);
      totals.set(key, (totals.get(key) ?? 0) + this.toNumber(sale.totalAmount));
    }

    return days.map((date) => ({
      dayKey: this.toDayKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      date,
      value: this.roundCurrency(totals.get(this.toDayKey(date)) ?? 0),
    }));
  }

  private getRangeStart(rangeDays: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (rangeDays - 1));
    return start;
  }

  private getNearExpiryCutoff() {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    return cutoff;
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

  private normalizeRangeDays(value: number | undefined) {
    const parsed = Number(value ?? DEFAULT_RANGE_DAYS);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_RANGE_DAYS;
    }

    return Math.min(Math.trunc(parsed), 365);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }

  private escapeCsv(value: string) {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replaceAll("\"", "\"\"")}"`;
    }

    return value;
  }
}
