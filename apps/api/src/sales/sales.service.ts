import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  MovementType,
  PaymentMethod,
  Prisma,
  SaleStatus,
  ReferenceType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateSaleDto } from "./dto/create-sale.dto";
import type { SalesRangeDto } from "./dto/sales-range.dto";
import type { VoidSaleDto } from "./dto/void-sale.dto";

const DEFAULT_RECONCILIATION_DAYS = 1;

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

type SaleCreationItemInput = {
  medicineId: string;
  quantity: number;
};

type SaleCreationInput = {
  paymentMethod: PaymentMethod;
  items: SaleCreationItemInput[];
  prescriptionId?: string | null;
  soldAt?: Date;
};

type CreatedSalePayload = {
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: Prisma.Decimal;
    paymentMethod: PaymentMethod;
    soldAt: Date;
    status?: SaleStatus;
  };
  items: Array<{
    medicineId: string;
    medicineName: string;
    quantity: number;
    batchNumber: string;
    unitPrice: number;
    lineTotal: number;
  }>;
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

    const voidAudits = await this.prisma.auditLog.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        action: AuditAction.SALE_VOIDED,
        entityId: {
          in: recentSales.map((sale) => sale.id),
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
    });

    const latestVoidAuditBySaleId = new Map(
      voidAudits.map((audit) => [audit.entityId, audit])
    );

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
        voidedAt:
          sale.status === SaleStatus.VOIDED
            ? latestVoidAuditBySaleId.get(sale.id)?.createdAt ?? sale.updatedAt
            : null,
        voidReason:
          this.asRecord(latestVoidAuditBySaleId.get(sale.id)?.metadata).reason ?? null,
        voidedBy: latestVoidAuditBySaleId.get(sale.id)?.user?.fullName ?? null,
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

  async getReconciliation(currentUser: AuthenticatedUser, query: SalesRangeDto) {
    const branch = await this.resolveBranch(currentUser);
    const rangeDays = this.normalizeRangeDays(query.rangeDays);
    const startDate = this.getRangeStart(rangeDays);
    const endDate = new Date();

    const [currentBatches, sales, movements, adjustments, voidAudits] =
      await Promise.all([
        this.prisma.stockBatch.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
          },
          select: {
            quantityOnHand: true,
          },
        }),
        this.prisma.sale.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            soldAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            items: true,
          },
          orderBy: {
            soldAt: "desc",
          },
        }),
        this.prisma.stockMovement.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: {
            createdAt: "desc",
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
                name: true,
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
        this.prisma.auditLog.findMany({
          where: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            action: AuditAction.SALE_VOIDED,
            createdAt: {
              gte: startDate,
              lte: endDate,
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
          take: 8,
        }),
      ]);

    const closingUnitsOnHand = currentBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand,
      0
    );
    const movementNetUnits = movements.reduce(
      (sum, movement) => sum + movement.quantityDelta,
      0
    );

    const stockInUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.STOCK_IN
    );
    const saleUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.SALE
    );
    const voidRestorationUnits = this.sumUnits(
      movements,
      (movement) =>
        movement.movementType === MovementType.RETURN &&
        movement.referenceType === ReferenceType.SALE
    );
    const adjustmentInUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.ADJUSTMENT_IN
    );
    const adjustmentOutUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.ADJUSTMENT_OUT
    );
    const damageUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.DAMAGE
    );
    const expiredUnits = this.sumUnits(
      movements,
      (movement) => movement.movementType === MovementType.EXPIRED
    );
    const supplierReturnUnits = this.sumUnits(
      movements,
      (movement) =>
        movement.movementType === MovementType.RETURN &&
        movement.referenceType === ReferenceType.INVENTORY_ADJUSTMENT
    );

    const completedSales = sales.filter((sale) => sale.status === SaleStatus.COMPLETED);
    const voidedSales = sales.filter((sale) => sale.status === SaleStatus.VOIDED);
    const grossSalesAmount = sales.reduce(
      (sum, sale) => sum + this.toNumber(sale.totalAmount),
      0
    );
    const netSalesAmount = completedSales.reduce(
      (sum, sale) => sum + this.toNumber(sale.totalAmount),
      0
    );
    const voidedSalesAmount = voidedSales.reduce(
      (sum, sale) => sum + this.toNumber(sale.totalAmount),
      0
    );
    const openingUnitsOnHand = closingUnitsOnHand - movementNetUnits;

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
      totals: {
        openingUnitsOnHand,
        closingUnitsOnHand,
        movementNetUnits,
        stockInUnits,
        saleUnits,
        voidRestorationUnits,
        adjustmentInUnits,
        adjustmentOutUnits,
        damageUnits,
        expiredUnits,
        supplierReturnUnits,
        grossSalesCount: sales.length,
        completedSalesCount: completedSales.length,
        voidedSalesCount: voidedSales.length,
        grossSalesAmount: this.roundCurrency(grossSalesAmount),
        netSalesAmount: this.roundCurrency(netSalesAmount),
        voidedSalesAmount: this.roundCurrency(voidedSalesAmount),
        suspectedLossCount: adjustments.filter(
          (adjustment) =>
            adjustment.reason === "LOST" || adjustment.reason === "THEFT_SUSPECTED"
        ).length,
        adjustmentEventCount: adjustments.length,
      },
      recentVoids: voidAudits.map((audit) => {
        const metadata = this.asRecord(audit.metadata);

        return {
          id: audit.id,
          saleId: audit.entityId,
          saleNumber: metadata.saleNumber ?? "N/A",
          totalAmount: this.toNumber(metadata.totalAmount ?? 0),
          itemCount: this.toNumber(metadata.itemCount ?? 0),
          reason: metadata.reason ?? "Unspecified",
          notes: metadata.notes ?? null,
          voidedBy: audit.user?.fullName ?? "System",
          voidedAt: audit.createdAt,
        };
      }),
      recentAdjustments: adjustments.slice(0, 8).map((adjustment) => ({
        id: adjustment.id,
        medicineName: adjustment.medicine.name,
        reason: adjustment.reason,
        quantityDelta: adjustment.quantityDelta,
        createdBy: adjustment.createdBy.fullName,
        createdAt: adjustment.createdAt,
      })),
    };
  }

  async createSale(currentUser: AuthenticatedUser, dto: CreateSaleDto) {
    const branch = await this.resolveBranch(currentUser);
    const result = await this.prisma.$transaction((tx) =>
      this.createSaleRecordInTransaction(tx, currentUser, branch, {
        paymentMethod: dto.paymentMethod,
        items: dto.items,
      })
    );

    return this.serializeCreatedSale(result);
  }

  async createSaleRecordInTransaction(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedUser,
    branch: {
      id: string;
      code: string;
    },
    input: SaleCreationInput
  ): Promise<CreatedSalePayload> {
    const normalizedItems = this.normalizeSaleItems(input.items);

    if (input.prescriptionId) {
      const existingPrescriptionSale = await tx.sale.findFirst({
        where: {
          pharmacyId: currentUser.pharmacyId,
          prescriptionId: input.prescriptionId,
        },
        select: {
          id: true,
        },
      });

      if (existingPrescriptionSale) {
        throw new BadRequestException(
          "This prescription has already been dispensed into a sale."
        );
      }
    }

    const medicineIds = normalizedItems.map((item) => item.medicineId);
    const medicines = await tx.medicine.findMany({
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
        const batches = await tx.stockBatch.findMany({
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
    const soldAt = input.soldAt ?? new Date();
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

    const sale = await tx.sale.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        prescriptionId: input.prescriptionId ?? undefined,
        saleNumber,
        totalAmount,
        paymentMethod: input.paymentMethod,
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
          source: input.prescriptionId ? "PRESCRIPTION" : "POS",
          prescriptionId: input.prescriptionId ?? null,
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
  }

  async voidSale(currentUser: AuthenticatedUser, saleId: string, dto: VoidSaleDto) {
    const branch = await this.resolveBranch(currentUser);
    const reason = dto.reason.trim();
    const notes = this.normalizeOptional(dto.notes);

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
      },
      include: {
        prescription: {
          select: {
            id: true,
            prescriptionNumber: true,
            status: true,
          },
        },
        items: {
          include: {
            medicine: {
              select: {
                name: true,
              },
            },
            stockBatch: {
              select: {
                id: true,
                batchNumber: true,
                quantityOnHand: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException("Sale was not found.");
    }

    if (sale.status === SaleStatus.VOIDED) {
      throw new BadRequestException("This sale has already been voided.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let reopenedPrescription: {
        id: string;
        prescriptionNumber: string;
        status: string;
      } | null = null;

      const updatedSale = await tx.sale.update({
        where: {
          id: sale.id,
        },
        data: {
          status: SaleStatus.VOIDED,
          prescriptionId: sale.prescriptionId ? null : undefined,
        },
      });

      const restoredItems = [];

      for (const item of sale.items) {
        const quantityAfter = item.stockBatch.quantityOnHand + item.quantity;

        await tx.stockBatch.update({
          where: {
            id: item.stockBatchId,
          },
          data: {
            quantityOnHand: quantityAfter,
          },
        });

        await tx.stockMovement.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: item.medicineId,
            stockBatchId: item.stockBatchId,
            movementType: MovementType.RETURN,
            referenceType: ReferenceType.SALE,
            referenceId: sale.id,
            quantityDelta: item.quantity,
            quantityAfter,
            createdById: currentUser.userId,
          },
        });

        restoredItems.push({
          medicineName: item.medicine.name,
          quantity: item.quantity,
          batchNumber: item.stockBatch.batchNumber,
          unitPrice: this.roundCurrency(this.toNumber(item.unitPrice)),
          lineTotal: this.roundCurrency(this.toNumber(item.lineTotal)),
        });
      }

      if (sale.prescriptionId && sale.prescription) {
        const updatedPrescription = await tx.prescription.update({
          where: {
            id: sale.prescriptionId,
          },
          data: {
            status: "READY",
            dispensedAt: null,
          },
          select: {
            id: true,
            prescriptionNumber: true,
            status: true,
          },
        });

        reopenedPrescription = updatedPrescription;

        await tx.auditLog.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            userId: currentUser.userId,
            action: AuditAction.PRESCRIPTION_STATUS_UPDATED,
            entityType: "Prescription",
            entityId: updatedPrescription.id,
            metadata: {
              prescriptionNumber: updatedPrescription.prescriptionNumber,
              previousStatus: sale.prescription.status,
              status: updatedPrescription.status,
              source: "SALE_VOIDED",
              saleNumber: sale.saleNumber,
              reason,
              notes,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.SALE_VOIDED,
          entityType: "Sale",
          entityId: sale.id,
          metadata: {
            saleNumber: sale.saleNumber,
            totalAmount: this.roundCurrency(this.toNumber(sale.totalAmount)),
            itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
            reason,
            notes,
            prescriptionNumber: sale.prescription?.prescriptionNumber ?? null,
            prescriptionReopened: reopenedPrescription ? true : false,
          },
        },
      });

      return {
        sale: updatedSale,
        restoredItems,
        prescription: reopenedPrescription,
      };
    });

    return {
      id: result.sale.id,
      saleNumber: result.sale.saleNumber,
      status: result.sale.status,
      totalAmount: this.roundCurrency(this.toNumber(result.sale.totalAmount)),
      paymentMethod: result.sale.paymentMethod,
      soldAt: result.sale.soldAt,
      voidedAt: result.sale.updatedAt,
      reason,
      notes,
      items: result.restoredItems,
      prescription: result.prescription,
    };
  }

  private serializeCreatedSale(result: CreatedSalePayload) {
    return {
      id: result.sale.id,
      saleNumber: result.sale.saleNumber,
      totalAmount: this.roundCurrency(this.toNumber(result.sale.totalAmount)),
      paymentMethod: result.sale.paymentMethod,
      soldAt: result.sale.soldAt,
      items: result.items,
    };
  }

  private normalizeSaleItems(items: SaleCreationItemInput[]) {
    const merged = new Map<string, number>();

    for (const item of items) {
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

  private getRangeStart(rangeDays: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (rangeDays - 1));
    return start;
  }

  private normalizeRangeDays(value: number | undefined) {
    const parsed = Number(value ?? DEFAULT_RECONCILIATION_DAYS);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_RECONCILIATION_DAYS;
    }

    return Math.min(Math.trunc(parsed), 30);
  }

  private normalizeOptional(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private sumUnits(
    movements: Array<{
      movementType: MovementType;
      referenceType: ReferenceType;
      quantityDelta: number;
    }>,
    predicate: (movement: {
      movementType: MovementType;
      referenceType: ReferenceType;
      quantityDelta: number;
    }) => boolean
  ) {
    return movements.reduce((sum, movement) => {
      if (!predicate(movement)) {
        return sum;
      }

      return sum + Math.abs(movement.quantityDelta);
    }, 0);
  }

  private asRecord(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {} as Record<string, string | number | null>;
    }

    return value as Record<string, string | number | null>;
  }

  private toNumber(
    value: Prisma.Decimal | number | string | null | undefined
  ) {
    if (typeof value === "number") {
      return value;
    }

    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
