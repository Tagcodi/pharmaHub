import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  MovementType,
  Prisma,
  ReferenceType,
} from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import type { StockInDto } from "./dto/stock-in.dto";

const LOW_STOCK_THRESHOLD = 20;
const NEAR_EXPIRY_DAYS = 30;

@Injectable()
export class InventoryService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getInventorySummary(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
      },
      include: {
        stockBatches: {
          where: {
            branchId: branch.id,
          },
          orderBy: [
            { receivedAt: "desc" },
            { createdAt: "desc" },
          ],
        },
      },
      orderBy: [
        { name: "asc" },
        { createdAt: "asc" },
      ],
    });

    const summaries = medicines.map((medicine) =>
      this.serializeMedicineSummary(medicine)
    );

    const totals = summaries.reduce(
      (acc, medicine) => {
        acc.totalStockValue += medicine.totalStockValue;
        acc.totalCostValue += medicine.totalCostValue;
        acc.activeBatchCount += medicine.activeBatchCount;
        acc.registeredMedicineCount += 1;
        acc.lowStockCount += medicine.isLowStock ? 1 : 0;
        acc.nearExpiryBatchCount += medicine.nearExpiryBatchCount;
        acc.totalUnitsOnHand += medicine.totalQuantityOnHand;
        acc.atRiskCount += medicine.isLowStock || medicine.isExpiringSoon ? 1 : 0;
        return acc;
      },
      {
        totalStockValue: 0,
        totalCostValue: 0,
        activeBatchCount: 0,
        registeredMedicineCount: 0,
        lowStockCount: 0,
        nearExpiryBatchCount: 0,
        totalUnitsOnHand: 0,
        atRiskCount: 0,
      }
    );

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      totals: {
        ...totals,
        totalStockValue: this.roundCurrency(totals.totalStockValue),
        totalCostValue: this.roundCurrency(totals.totalCostValue),
      },
      medicines: summaries,
    };
  }

  async stockIn(currentUser: AuthenticatedUser, dto: StockInDto) {
    const branch = await this.resolveBranch(currentUser);
    const batchNumber = dto.batchNumber.trim();
    const expiryDate = new Date(dto.expiryDate);
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    if (Number.isNaN(expiryDate.getTime())) {
      throw new BadRequestException("A valid expiry date is required.");
    }

    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException("A valid received date is required.");
    }

    if (expiryDate.getTime() <= receivedAt.getTime()) {
      throw new BadRequestException(
        "Expiry date must be after the received date."
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const { medicine, wasCreated } = await this.resolveMedicine(tx, currentUser, dto);

      const existingBatch = await tx.stockBatch.findFirst({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: medicine.id,
          batchNumber: {
            equals: batchNumber,
            mode: "insensitive",
          },
        },
      });

      if (existingBatch) {
        throw new BadRequestException(
          "That batch number already exists for the selected medicine."
        );
      }

      const batch = await tx.stockBatch.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: medicine.id,
          batchNumber,
          expiryDate,
          quantityOnHand: dto.quantity,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          supplierName: this.normalizeOptional(dto.supplierName),
          receivedAt,
          createdById: currentUser.userId,
        },
      });

      await tx.stockMovement.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: medicine.id,
          stockBatchId: batch.id,
          movementType: MovementType.STOCK_IN,
          referenceType: ReferenceType.STOCK_BATCH,
          referenceId: batch.id,
          quantityDelta: dto.quantity,
          quantityAfter: dto.quantity,
          createdById: currentUser.userId,
        },
      });

      if (wasCreated) {
        await tx.auditLog.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            userId: currentUser.userId,
            action: AuditAction.MEDICINE_CREATED,
            entityType: "Medicine",
            entityId: medicine.id,
            metadata: {
              name: medicine.name,
              form: medicine.form,
              strength: medicine.strength,
              source: "stock_in",
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.STOCK_BATCH_CREATED,
          entityType: "StockBatch",
          entityId: batch.id,
          metadata: {
            medicineId: medicine.id,
            medicineName: medicine.name,
            batchNumber: batch.batchNumber,
            quantity: dto.quantity,
            costPrice: dto.costPrice,
            sellingPrice: dto.sellingPrice,
            supplierName: batch.supplierName,
          },
        },
      });

      return {
        medicine,
        batch,
      };
    });

    return {
      medicine: {
        id: result.medicine.id,
        name: result.medicine.name,
        genericName: result.medicine.genericName,
        brandName: result.medicine.brandName,
        form: result.medicine.form,
        strength: result.medicine.strength,
        category: result.medicine.category,
        unit: result.medicine.unit,
      },
      batch: {
        id: result.batch.id,
        batchNumber: result.batch.batchNumber,
        quantityOnHand: result.batch.quantityOnHand,
        expiryDate: result.batch.expiryDate,
        sellingPrice: this.toNumber(result.batch.sellingPrice),
        costPrice: this.toNumber(result.batch.costPrice),
        supplierName: result.batch.supplierName,
        receivedAt: result.batch.receivedAt,
      },
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

  private async resolveMedicine(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedUser,
    dto: StockInDto
  ) {
    if (dto.medicineId) {
      const medicine = await tx.medicine.findFirst({
        where: {
          id: dto.medicineId,
          pharmacyId: currentUser.pharmacyId,
        },
      });

      if (!medicine) {
        throw new NotFoundException("Selected medicine was not found.");
      }

      return { medicine, wasCreated: false };
    }

    const name = this.normalizeRequired(
      dto.name,
      "Medicine name is required when adding a new catalog item."
    );
    const strength = this.normalizeOptional(dto.strength);
    const form = this.normalizeOptional(dto.form);

    const existingMedicine = await tx.medicine.findFirst({
      where: {
        pharmacyId: currentUser.pharmacyId,
        name: {
          equals: name,
          mode: "insensitive",
        },
        strength: strength
          ? {
              equals: strength,
              mode: "insensitive",
            }
          : null,
        form: form
          ? {
              equals: form,
              mode: "insensitive",
            }
          : null,
      },
    });

    if (existingMedicine) {
      const updatedMedicine = await tx.medicine.update({
        where: {
          id: existingMedicine.id,
        },
        data: {
          genericName: existingMedicine.genericName ?? this.normalizeOptional(dto.genericName),
          brandName: existingMedicine.brandName ?? this.normalizeOptional(dto.brandName),
          sku: existingMedicine.sku ?? this.normalizeOptional(dto.sku),
          category: existingMedicine.category ?? this.normalizeOptional(dto.category),
          unit: existingMedicine.unit ?? this.normalizeOptional(dto.unit),
        },
      });

      return { medicine: updatedMedicine, wasCreated: false };
    }

    const medicine = await tx.medicine.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        name,
        genericName: this.normalizeOptional(dto.genericName),
        brandName: this.normalizeOptional(dto.brandName),
        sku: this.normalizeOptional(dto.sku),
        form,
        strength,
        category: this.normalizeOptional(dto.category),
        unit: this.normalizeOptional(dto.unit),
      },
    });

    return { medicine, wasCreated: true };
  }

  private serializeMedicineSummary(medicine: {
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
    createdAt: Date;
    stockBatches: Array<{
      id: string;
      batchNumber: string;
      expiryDate: Date;
      quantityOnHand: number;
      costPrice: Prisma.Decimal;
      sellingPrice: Prisma.Decimal;
      supplierName: string | null;
      receivedAt: Date;
    }>;
  }) {
    const nearExpiryCutoff = this.getNearExpiryCutoff();
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
    const totalCostValue = activeBatches.reduce(
      (sum, batch) => sum + batch.quantityOnHand * this.toNumber(batch.costPrice),
      0
    );
    const nextExpiryBatch = activeBatches.reduce<
      (typeof activeBatches)[number] | null
    >((closest, batch) => {
      if (!closest) {
        return batch;
      }

      return batch.expiryDate < closest.expiryDate ? batch : closest;
    }, null);
    const latestBatch = medicine.stockBatches[0] ?? null;
    const nearExpiryBatchCount = activeBatches.filter(
      (batch) => batch.expiryDate <= nearExpiryCutoff
    ).length;
    const isLowStock = totalQuantityOnHand <= LOW_STOCK_THRESHOLD;
    const isExpiringSoon = nearExpiryBatchCount > 0;

    return {
      id: medicine.id,
      name: medicine.name,
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      sku: medicine.sku,
      form: medicine.form,
      strength: medicine.strength,
      category: medicine.category,
      unit: medicine.unit,
      isActive: medicine.isActive,
      createdAt: medicine.createdAt,
      totalQuantityOnHand,
      totalStockValue: this.roundCurrency(totalStockValue),
      totalCostValue: this.roundCurrency(totalCostValue),
      activeBatchCount: activeBatches.length,
      nearExpiryBatchCount,
      currentBatchNumber: nextExpiryBatch?.batchNumber ?? null,
      currentCostPrice: nextExpiryBatch
        ? this.roundCurrency(this.toNumber(nextExpiryBatch.costPrice))
        : null,
      currentSellingPrice: nextExpiryBatch
        ? this.roundCurrency(this.toNumber(nextExpiryBatch.sellingPrice))
        : null,
      latestBatchNumber: latestBatch?.batchNumber ?? null,
      latestCostPrice: latestBatch
        ? this.roundCurrency(this.toNumber(latestBatch.costPrice))
        : null,
      latestSellingPrice: latestBatch
        ? this.roundCurrency(this.toNumber(latestBatch.sellingPrice))
        : null,
      lastReceivedAt: latestBatch?.receivedAt ?? null,
      nextExpiryDate: nextExpiryBatch?.expiryDate ?? null,
      supplierName: latestBatch?.supplierName ?? null,
      isLowStock,
      isExpiringSoon,
    };
  }

  private getNearExpiryCutoff() {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    return cutoff;
  }

  private normalizeOptional(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequired(value: string | undefined, message: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private toNumber(value: Prisma.Decimal | number) {
    return typeof value === "number" ? value : Number(value);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
