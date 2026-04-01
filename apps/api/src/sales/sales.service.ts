import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  MovementType,
  PaymentMethod,
  Prisma,
  ReferenceType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateSaleDto } from "./dto/create-sale.dto";

type BatchAllocation = {
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  quantityAfter: number;
};

type SaleLine = {
  medicineId: string;
  medicineName: string;
  requestedQuantity: number;
  allocations: BatchAllocation[];
};

@Injectable()
export class SalesService {
  private readonly prisma: PrismaService;
  private readonly inventoryService: InventoryService;

  constructor(prisma: PrismaService, inventoryService: InventoryService) {
    this.prisma = prisma;
    this.inventoryService = inventoryService;
  }

  async getCatalog(currentUser: AuthenticatedUser) {
    const inventory = await this.inventoryService.getInventorySummary(currentUser);

    return {
      branch: inventory.branch,
      medicines: inventory.medicines
        .filter((medicine) => medicine.isActive && medicine.totalQuantityOnHand > 0)
        .map((medicine) => ({
          id: medicine.id,
          name: medicine.name,
          genericName: medicine.genericName,
          brandName: medicine.brandName,
          category: medicine.category,
          form: medicine.form,
          strength: medicine.strength,
          unit: medicine.unit,
          totalQuantityOnHand: medicine.totalQuantityOnHand,
          currentSellingPrice:
            medicine.currentSellingPrice ?? medicine.latestSellingPrice ?? 0,
          currentBatchNumber:
            medicine.currentBatchNumber ?? medicine.latestBatchNumber,
          nextExpiryDate: medicine.nextExpiryDate,
          isLowStock: medicine.isLowStock,
        })),
    };
  }

  async getOverview(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const todayStart = this.getStartOfToday();

    const [todaySales, recentSales] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          status: "COMPLETED",
          soldAt: {
            gte: todayStart,
          },
        },
      }),
      this.prisma.sale.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
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
        take: 12,
      }),
    ]);

    const todaySalesAmount = todaySales.reduce(
      (sum, sale) => sum + this.toNumber(sale.totalAmount),
      0
    );

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        todaySalesAmount: this.roundCurrency(todaySalesAmount),
        todaySalesCount: todaySales.length,
        averageTicket:
          todaySales.length > 0
            ? this.roundCurrency(todaySalesAmount / todaySales.length)
            : 0,
      },
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.saleNumber,
        totalAmount: this.roundCurrency(this.toNumber(sale.totalAmount)),
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        soldAt: sale.soldAt,
        soldBy: sale.soldBy.fullName,
        itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
        items: sale.items.map((item) => ({
          medicineName: item.medicine.name,
          quantity: item.quantity,
          unitPrice: this.roundCurrency(this.toNumber(item.unitPrice)),
          lineTotal: this.roundCurrency(this.toNumber(item.lineTotal)),
        })),
      })),
    };
  }

  async createSale(currentUser: AuthenticatedUser, dto: CreateSaleDto) {
    const branch = await this.resolveBranch(currentUser);
    const normalizedItems = this.normalizeItems(dto);

    const medicineIds = normalizedItems.map((item) => item.medicineId);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        id: {
          in: medicineIds,
        },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    const medicineMap = new Map(medicines.map((medicine) => [medicine.id, medicine]));

    for (const item of normalizedItems) {
      const medicine = medicineMap.get(item.medicineId);

      if (!medicine) {
        throw new NotFoundException("One or more medicines were not found.");
      }

      if (!medicine.isActive) {
        throw new BadRequestException(`${medicine.name} is inactive and cannot be sold.`);
      }
    }

    const saleLines = await Promise.all(
      normalizedItems.map(async (item) => {
        const medicine = medicineMap.get(item.medicineId)!;
        const batches = await this.prisma.stockBatch.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: item.medicineId,
            quantityOnHand: {
              gt: 0,
            },
          },
          orderBy: [
            { expiryDate: "asc" },
            { receivedAt: "asc" },
            { createdAt: "asc" },
          ],
        });

        const totalAvailable = batches.reduce(
          (sum, batch) => sum + batch.quantityOnHand,
          0
        );

        if (totalAvailable < item.quantity) {
          throw new BadRequestException(
            `${medicine.name} only has ${totalAvailable} units available.`
          );
        }

        let remaining = item.quantity;
        const allocations: BatchAllocation[] = [];

        for (const batch of batches) {
          if (remaining <= 0) {
            break;
          }

          const quantity = Math.min(batch.quantityOnHand, remaining);

          allocations.push({
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            quantity,
            unitPrice: batch.sellingPrice,
            quantityAfter: batch.quantityOnHand - quantity,
          });

          remaining -= quantity;
        }

        return {
          medicineId: item.medicineId,
          medicineName: medicine.name,
          requestedQuantity: item.quantity,
          allocations,
        } satisfies SaleLine;
      })
    );

    const saleNumber = this.generateSaleNumber(branch.code);
    const soldAt = new Date();
    const totalAmount = saleLines.reduce((sum, line) => {
      return (
        sum +
        line.allocations.reduce(
          (lineSum, allocation) =>
            lineSum + allocation.quantity * this.toNumber(allocation.unitPrice),
          0
        )
      );
    }, 0);

    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          saleNumber,
          totalAmount,
          paymentMethod: dto.paymentMethod,
          soldById: currentUser.userId,
          soldAt,
        },
      });

      for (const line of saleLines) {
        for (const allocation of line.allocations) {
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              medicineId: line.medicineId,
              stockBatchId: allocation.batchId,
              quantity: allocation.quantity,
              unitPrice: allocation.unitPrice,
              lineTotal: this.roundCurrency(
                allocation.quantity * this.toNumber(allocation.unitPrice)
              ),
            },
          });

          await tx.stockBatch.update({
            where: {
              id: allocation.batchId,
            },
            data: {
              quantityOnHand: allocation.quantityAfter,
            },
          });

          await tx.stockMovement.create({
            data: {
              pharmacyId: currentUser.pharmacyId,
              branchId: branch.id,
              medicineId: line.medicineId,
              stockBatchId: allocation.batchId,
              movementType: MovementType.SALE,
              referenceType: ReferenceType.SALE,
              referenceId: sale.id,
              quantityDelta: allocation.quantity * -1,
              quantityAfter: allocation.quantityAfter,
              createdById: currentUser.userId,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.SALE_CREATED,
          entityType: "Sale",
          entityId: sale.id,
          metadata: {
            saleNumber: sale.saleNumber,
            itemCount: saleLines.reduce(
              (sum, line) => sum + line.requestedQuantity,
              0
            ),
            paymentMethod: sale.paymentMethod,
            totalAmount: this.roundCurrency(totalAmount),
          },
        },
      });

      const items = saleLines.flatMap((line) =>
        line.allocations.map((allocation) => ({
          medicineId: line.medicineId,
          medicineName: line.medicineName,
          quantity: allocation.quantity,
          batchNumber: allocation.batchNumber,
          unitPrice: this.roundCurrency(this.toNumber(allocation.unitPrice)),
          lineTotal: this.roundCurrency(
            allocation.quantity * this.toNumber(allocation.unitPrice)
          ),
        }))
      );

      return {
        sale,
        items,
      };
    });

    return {
      id: result.sale.id,
      saleNumber: result.sale.saleNumber,
      totalAmount: this.roundCurrency(this.toNumber(result.sale.totalAmount)),
      paymentMethod: result.sale.paymentMethod,
      soldAt: result.sale.soldAt,
      items: result.items,
    };
  }

  private normalizeItems(dto: CreateSaleDto) {
    const merged = new Map<string, number>();

    for (const item of dto.items) {
      merged.set(item.medicineId, (merged.get(item.medicineId) ?? 0) + item.quantity);
    }

    return Array.from(merged.entries()).map(([medicineId, quantity]) => ({
      medicineId,
      quantity,
    }));
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

  private generateSaleNumber(branchCode: string) {
    const now = new Date();
    const date =
      `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(2, "0")}${`${now.getDate()}`.padStart(2, "0")}`;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    return `${branchCode}-${date}-${suffix}`;
  }

  private getStartOfToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private toNumber(value: Prisma.Decimal | number) {
    return typeof value === "number" ? value : Number(value);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
