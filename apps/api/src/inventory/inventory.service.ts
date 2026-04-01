import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AdjustmentReason,
  AuditAction,
  MovementType,
  Prisma,
  ReferenceType,
} from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import type { AdjustStockDto } from "./dto/adjust-stock.dto";
import type { CreateDisposalDto } from "./dto/create-disposal.dto";
import type { CycleCountDto } from "./dto/cycle-count.dto";
import type { StockInDto } from "./dto/stock-in.dto";

const LOW_STOCK_THRESHOLD = 20;
const NEAR_EXPIRY_DAYS = 30;
const DISPOSAL_REASONS = [
  AdjustmentReason.DAMAGE,
  AdjustmentReason.EXPIRED,
  AdjustmentReason.RETURN_TO_SUPPLIER,
] as const;

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

  async getAdjustmentCatalog(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
      },
      include: {
        stockBatches: {
          where: {
            branchId: branch.id,
            quantityOnHand: {
              gt: 0,
            },
          },
          orderBy: [{ expiryDate: "asc" }, { receivedAt: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      medicines: medicines
        .filter((medicine) => medicine.stockBatches.length > 0)
        .map((medicine) => {
          const summary = this.serializeMedicineSummary(medicine);

          return {
            id: medicine.id,
            name: medicine.name,
            genericName: medicine.genericName,
            brandName: medicine.brandName,
            form: medicine.form,
            strength: medicine.strength,
            category: medicine.category,
            unit: medicine.unit,
            totalQuantityOnHand: summary.totalQuantityOnHand,
            activeBatchCount: summary.activeBatchCount,
            isLowStock: summary.isLowStock,
            batches: medicine.stockBatches.map((batch) =>
              this.serializeAdjustmentBatch(batch)
            ),
          };
        }),
    };
  }

  async getAdjustments(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const adjustments = await this.prisma.inventoryAdjustment.findMany({
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
        stockBatch: {
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantityOnHand: true,
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
      take: 40,
    });

    const movementSnapshots = await this.prisma.stockMovement.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        referenceType: ReferenceType.INVENTORY_ADJUSTMENT,
        referenceId: {
          in: adjustments.map((adjustment) => adjustment.id),
        },
      },
      select: {
        referenceId: true,
        quantityAfter: true,
      },
    });

    const quantityAfterByAdjustment = new Map(
      movementSnapshots.map((movement) => [movement.referenceId, movement.quantityAfter])
    );

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalAdjustments: adjustments.length,
        positiveAdjustments: adjustments.filter(
          (adjustment) => adjustment.quantityDelta > 0
        ).length,
        negativeAdjustments: adjustments.filter(
          (adjustment) => adjustment.quantityDelta < 0
        ).length,
        suspectedLossCount: adjustments.filter(
          (adjustment) =>
            adjustment.reason === AdjustmentReason.LOST ||
            adjustment.reason === AdjustmentReason.THEFT_SUSPECTED
        ).length,
        netUnitsDelta: adjustments.reduce(
          (sum, adjustment) => sum + adjustment.quantityDelta,
          0
        ),
      },
      adjustments: adjustments.map((adjustment) =>
        this.serializeAdjustmentRecord(
          adjustment,
          quantityAfterByAdjustment.get(adjustment.id) ??
            adjustment.stockBatch.quantityOnHand
        )
      ),
    };
  }

  async getDisposalCatalog(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        quantityOnHand: {
          gt: 0,
        },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            brandName: true,
            form: true,
            strength: true,
            category: true,
            unit: true,
          },
        },
      },
      orderBy: [
        { expiryDate: "asc" },
        { receivedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalBatches: batches.length,
        totalUnitsOnHand: batches.reduce((sum, batch) => sum + batch.quantityOnHand, 0),
        expiredBatchCount: batches.filter((batch) => this.isExpired(batch.expiryDate)).length,
        expiringSoonBatchCount: batches.filter((batch) =>
          batch.expiryDate <= this.getNearExpiryCutoff()
        ).length,
        returnableBatchCount: batches.filter((batch) => Boolean(batch.supplierName)).length,
      },
      batches: batches.map((batch) => this.serializeDisposalCatalogBatch(batch)),
    };
  }

  async getDisposals(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const adjustments = await this.prisma.inventoryAdjustment.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        reason: {
          in: [...DISPOSAL_REASONS],
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
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantityOnHand: true,
            supplierName: true,
            costPrice: true,
            sellingPrice: true,
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
      take: 50,
    });

    const movementSnapshots = await this.prisma.stockMovement.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        referenceType: ReferenceType.INVENTORY_ADJUSTMENT,
        referenceId: {
          in: adjustments.map((adjustment) => adjustment.id),
        },
      },
      select: {
        referenceId: true,
        quantityAfter: true,
      },
    });

    const quantityAfterByAdjustment = new Map(
      movementSnapshots.map((movement) => [movement.referenceId, movement.quantityAfter])
    );

    const totalRetailValueRemoved = adjustments.reduce((sum, adjustment) => {
      return (
        sum +
        Math.abs(adjustment.quantityDelta) * this.toNumber(adjustment.stockBatch.sellingPrice)
      );
    }, 0);

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalDisposals: adjustments.length,
        damagedCount: adjustments.filter(
          (adjustment) => adjustment.reason === AdjustmentReason.DAMAGE
        ).length,
        expiredCount: adjustments.filter(
          (adjustment) => adjustment.reason === AdjustmentReason.EXPIRED
        ).length,
        returnedCount: adjustments.filter(
          (adjustment) => adjustment.reason === AdjustmentReason.RETURN_TO_SUPPLIER
        ).length,
        totalUnitsRemoved: adjustments.reduce(
          (sum, adjustment) => sum + Math.abs(adjustment.quantityDelta),
          0
        ),
        totalRetailValueRemoved: this.roundCurrency(totalRetailValueRemoved),
      },
      disposals: adjustments.map((adjustment) =>
        this.serializeDisposalRecord(
          adjustment,
          quantityAfterByAdjustment.get(adjustment.id) ??
            adjustment.stockBatch.quantityOnHand
        )
      ),
    };
  }

  async getCycleCountCatalog(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        quantityOnHand: {
          gt: 0,
        },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            brandName: true,
            form: true,
            strength: true,
            category: true,
            unit: true,
          },
        },
      },
      orderBy: [
        { medicine: { name: "asc" } },
        { expiryDate: "asc" },
        { receivedAt: "desc" },
      ],
    });

    const quantityByMedicine = new Map<string, number>();

    for (const batch of batches) {
      quantityByMedicine.set(
        batch.medicineId,
        (quantityByMedicine.get(batch.medicineId) ?? 0) + batch.quantityOnHand
      );
    }

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalBatches: batches.length,
        totalUnitsOnHand: batches.reduce((sum, batch) => sum + batch.quantityOnHand, 0),
        expiringSoonBatchCount: batches.filter(
          (batch) => batch.expiryDate <= this.getNearExpiryCutoff()
        ).length,
        lowStockMedicineCount: Array.from(quantityByMedicine.values()).filter(
          (quantity) => quantity <= LOW_STOCK_THRESHOLD
        ).length,
      },
      batches: batches.map((batch) => ({
        stockBatchId: batch.id,
        medicineId: batch.medicine.id,
        medicineName: batch.medicine.name,
        genericName: batch.medicine.genericName,
        brandName: batch.medicine.brandName,
        form: batch.medicine.form,
        strength: batch.medicine.strength,
        category: batch.medicine.category,
        unit: batch.medicine.unit,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        systemQuantity: batch.quantityOnHand,
        totalMedicineQuantity: quantityByMedicine.get(batch.medicineId) ?? batch.quantityOnHand,
        supplierName: batch.supplierName,
        receivedAt: batch.receivedAt,
        isExpiringSoon: batch.expiryDate <= this.getNearExpiryCutoff(),
        isLowStock:
          (quantityByMedicine.get(batch.medicineId) ?? batch.quantityOnHand) <=
          LOW_STOCK_THRESHOLD,
      })),
    };
  }

  async getCycleCounts(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
        action: AuditAction.STOCK_ADJUSTED,
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
      take: 100,
    });

    const cycleCounts = auditLogs
      .map((log) => {
        const metadata = this.asAuditRecord(log.metadata);

        if (metadata.source !== "cycle_count") {
          return null;
        }

        const previousQuantity = this.asNumber(metadata.previousQuantity);
        const countedQuantity = this.asNumber(metadata.countedQuantity);
        const quantityDelta = this.asNumber(metadata.quantityDelta);

        return {
          id: log.id,
          batchNumber: String(metadata.batchNumber ?? "N/A"),
          medicineName: String(metadata.medicineName ?? "Unknown"),
          previousQuantity,
          countedQuantity,
          quantityDelta,
          notes: typeof metadata.notes === "string" ? metadata.notes : null,
          createdBy: log.user?.fullName ?? "System",
          createdAt: log.createdAt,
          varianceType:
            quantityDelta === 0
              ? "MATCH"
              : quantityDelta < 0
                ? "SHORTAGE"
                : "OVERAGE",
        };
      })
      .filter((item) => item !== null);

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        countEvents: cycleCounts.length,
        matchedCount: cycleCounts.filter((item) => item.varianceType === "MATCH")
          .length,
        varianceCount: cycleCounts.filter((item) => item.quantityDelta !== 0).length,
        shortageEvents: cycleCounts.filter((item) => item.quantityDelta < 0).length,
        overageEvents: cycleCounts.filter((item) => item.quantityDelta > 0).length,
        netVarianceUnits: cycleCounts.reduce(
          (sum, item) => sum + item.quantityDelta,
          0
        ),
      },
      counts: cycleCounts,
    };
  }

  async adjustStock(currentUser: AuthenticatedUser, dto: AdjustStockDto) {
    const branch = await this.resolveBranch(currentUser);
    const notes = this.normalizeOptional(dto.notes);

    if (dto.quantityDelta === 0) {
      throw new BadRequestException("Adjustment quantity cannot be zero.");
    }

    this.validateAdjustmentDirection(dto.reason, dto.quantityDelta);

    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findFirst({
        where: {
          id: dto.stockBatchId,
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
      });

      if (!batch) {
        throw new NotFoundException("Selected stock batch was not found.");
      }

      const quantityAfter = batch.quantityOnHand + dto.quantityDelta;

      if (quantityAfter < 0) {
        throw new BadRequestException(
          `${batch.medicine.name} batch ${batch.batchNumber} only has ${batch.quantityOnHand} units available.`
        );
      }

      const updatedBatch = await tx.stockBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          quantityOnHand: quantityAfter,
        },
      });

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: batch.medicineId,
          stockBatchId: batch.id,
          reason: dto.reason,
          notes,
          quantityDelta: dto.quantityDelta,
          createdById: currentUser.userId,
        },
      });

      await tx.stockMovement.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: batch.medicineId,
          stockBatchId: batch.id,
          movementType: this.mapAdjustmentMovementType(dto.reason, dto.quantityDelta),
          referenceType: ReferenceType.INVENTORY_ADJUSTMENT,
          referenceId: adjustment.id,
          quantityDelta: dto.quantityDelta,
          quantityAfter,
          createdById: currentUser.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.STOCK_ADJUSTED,
          entityType: "InventoryAdjustment",
          entityId: adjustment.id,
          metadata: {
            medicineId: batch.medicine.id,
            medicineName: batch.medicine.name,
            batchNumber: batch.batchNumber,
            reason: dto.reason,
            quantityDelta: dto.quantityDelta,
            quantityAfter,
            notes,
          },
        },
      });

      return {
        adjustment,
        batch: updatedBatch,
        medicine: batch.medicine,
      };
    });

    return {
      id: result.adjustment.id,
      reason: result.adjustment.reason,
      notes: result.adjustment.notes,
      quantityDelta: result.adjustment.quantityDelta,
      quantityAfter: result.batch.quantityOnHand,
      createdAt: result.adjustment.createdAt,
      medicine: {
        id: result.medicine.id,
        name: result.medicine.name,
      },
      batch: {
        id: result.batch.id,
        batchNumber: result.batch.batchNumber,
      },
    };
  }

  async createDisposal(currentUser: AuthenticatedUser, dto: CreateDisposalDto) {
    const branch = await this.resolveBranch(currentUser);
    const notes = this.normalizeOptional(dto.notes);
    const quantityDelta = -dto.quantity;

    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findFirst({
        where: {
          id: dto.stockBatchId,
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
      });

      if (!batch) {
        throw new NotFoundException("Selected stock batch was not found.");
      }

      if (
        dto.reason === AdjustmentReason.RETURN_TO_SUPPLIER &&
        !batch.supplierName
      ) {
        throw new BadRequestException(
          "This batch does not have a supplier reference, so it cannot be returned upstream."
        );
      }

      const quantityAfter = batch.quantityOnHand + quantityDelta;

      if (quantityAfter < 0) {
        throw new BadRequestException(
          `${batch.medicine.name} batch ${batch.batchNumber} only has ${batch.quantityOnHand} units available.`
        );
      }

      const updatedBatch = await tx.stockBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          quantityOnHand: quantityAfter,
        },
      });

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: batch.medicineId,
          stockBatchId: batch.id,
          reason: dto.reason,
          notes,
          quantityDelta,
          createdById: currentUser.userId,
        },
      });

      await tx.stockMovement.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          medicineId: batch.medicineId,
          stockBatchId: batch.id,
          movementType: this.mapAdjustmentMovementType(dto.reason, quantityDelta),
          referenceType: ReferenceType.INVENTORY_ADJUSTMENT,
          referenceId: adjustment.id,
          quantityDelta,
          quantityAfter,
          createdById: currentUser.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.STOCK_ADJUSTED,
          entityType: "InventoryDisposal",
          entityId: adjustment.id,
          metadata: {
            source: "disposal",
            medicineId: batch.medicine.id,
            medicineName: batch.medicine.name,
            batchNumber: batch.batchNumber,
            supplierName: batch.supplierName,
            reason: dto.reason,
            quantityDelta,
            disposedQuantity: dto.quantity,
            quantityAfter,
            notes,
          },
        },
      });

      return {
        adjustment,
        batch: updatedBatch,
        medicine: batch.medicine,
        supplierName: batch.supplierName,
      };
    });

    return {
      id: result.adjustment.id,
      reason: result.adjustment.reason,
      notes: result.adjustment.notes,
      quantityRemoved: Math.abs(result.adjustment.quantityDelta),
      quantityAfter: result.batch.quantityOnHand,
      createdAt: result.adjustment.createdAt,
      medicine: {
        id: result.medicine.id,
        name: result.medicine.name,
      },
      batch: {
        id: result.batch.id,
        batchNumber: result.batch.batchNumber,
      },
      supplierName: result.supplierName,
    };
  }

  async cycleCount(currentUser: AuthenticatedUser, dto: CycleCountDto) {
    const branch = await this.resolveBranch(currentUser);
    const notes = this.normalizeOptional(dto.notes);

    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findFirst({
        where: {
          id: dto.stockBatchId,
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
      });

      if (!batch) {
        throw new NotFoundException("Selected stock batch was not found.");
      }

      const previousQuantity = batch.quantityOnHand;
      const countedQuantity = dto.countedQuantity;
      const quantityDelta = countedQuantity - previousQuantity;
      let adjustmentId: string | null = null;

      if (quantityDelta !== 0) {
        await tx.stockBatch.update({
          where: {
            id: batch.id,
          },
          data: {
            quantityOnHand: countedQuantity,
          },
        });

        const adjustment = await tx.inventoryAdjustment.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: batch.medicineId,
            stockBatchId: batch.id,
            reason: AdjustmentReason.COUNT_CORRECTION,
            notes,
            quantityDelta,
            createdById: currentUser.userId,
          },
        });

        adjustmentId = adjustment.id;

        await tx.stockMovement.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: batch.medicineId,
            stockBatchId: batch.id,
            movementType:
              quantityDelta > 0
                ? MovementType.ADJUSTMENT_IN
                : MovementType.ADJUSTMENT_OUT,
            referenceType: ReferenceType.INVENTORY_ADJUSTMENT,
            referenceId: adjustment.id,
            quantityDelta,
            quantityAfter: countedQuantity,
            createdById: currentUser.userId,
          },
        });
      }

      const auditLog = await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.STOCK_ADJUSTED,
          entityType: "CycleCount",
          entityId: adjustmentId,
          metadata: {
            source: "cycle_count",
            medicineId: batch.medicine.id,
            medicineName: batch.medicine.name,
            batchNumber: batch.batchNumber,
            previousQuantity,
            countedQuantity,
            quantityDelta,
            quantityAfter: countedQuantity,
            notes,
          },
        },
      });

      return {
        id: auditLog.id,
        medicine: batch.medicine,
        batchNumber: batch.batchNumber,
        previousQuantity,
        countedQuantity,
        quantityDelta,
        notes,
        createdAt: auditLog.createdAt,
      };
    });

    return {
      id: result.id,
      medicine: {
        id: result.medicine.id,
        name: result.medicine.name,
      },
      batchNumber: result.batchNumber,
      previousQuantity: result.previousQuantity,
      countedQuantity: result.countedQuantity,
      quantityDelta: result.quantityDelta,
      notes: result.notes,
      varianceType:
        result.quantityDelta === 0
          ? "MATCH"
          : result.quantityDelta < 0
            ? "SHORTAGE"
            : "OVERAGE",
      createdAt: result.createdAt,
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

  private serializeAdjustmentBatch(batch: {
    id: string;
    batchNumber: string;
    expiryDate: Date;
    quantityOnHand: number;
    costPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    supplierName: string | null;
    receivedAt: Date;
  }) {
    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityOnHand: batch.quantityOnHand,
      costPrice: this.roundCurrency(this.toNumber(batch.costPrice)),
      sellingPrice: this.roundCurrency(this.toNumber(batch.sellingPrice)),
      supplierName: batch.supplierName,
      receivedAt: batch.receivedAt,
      isExpiringSoon: batch.expiryDate <= this.getNearExpiryCutoff(),
    };
  }

  private serializeAdjustmentRecord(
    adjustment: {
      id: string;
      reason: AdjustmentReason;
      notes: string | null;
      quantityDelta: number;
      createdAt: Date;
      medicine: {
        id: string;
        name: string;
      };
      stockBatch: {
        id: string;
        batchNumber: string;
        expiryDate: Date;
        quantityOnHand: number;
      };
      createdBy: {
        fullName: string;
      };
    },
    quantityAfter: number
  ) {
    return {
      id: adjustment.id,
      reason: adjustment.reason,
      notes: adjustment.notes,
      quantityDelta: adjustment.quantityDelta,
      quantityAfter,
      createdAt: adjustment.createdAt,
      createdBy: adjustment.createdBy.fullName,
      medicine: {
        id: adjustment.medicine.id,
        name: adjustment.medicine.name,
      },
      batch: {
        id: adjustment.stockBatch.id,
        batchNumber: adjustment.stockBatch.batchNumber,
        expiryDate: adjustment.stockBatch.expiryDate,
        currentQuantityOnHand: adjustment.stockBatch.quantityOnHand,
      },
    };
  }

  private serializeDisposalCatalogBatch(batch: {
    id: string;
    batchNumber: string;
    expiryDate: Date;
    quantityOnHand: number;
    costPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    supplierName: string | null;
    receivedAt: Date;
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
  }) {
    const isExpired = this.isExpired(batch.expiryDate);
    const isExpiringSoon = batch.expiryDate <= this.getNearExpiryCutoff();

    return {
      stockBatchId: batch.id,
      medicineId: batch.medicine.id,
      medicineName: batch.medicine.name,
      genericName: batch.medicine.genericName,
      brandName: batch.medicine.brandName,
      form: batch.medicine.form,
      strength: batch.medicine.strength,
      category: batch.medicine.category,
      unit: batch.medicine.unit,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityOnHand: batch.quantityOnHand,
      costPrice: this.roundCurrency(this.toNumber(batch.costPrice)),
      sellingPrice: this.roundCurrency(this.toNumber(batch.sellingPrice)),
      supplierName: batch.supplierName,
      receivedAt: batch.receivedAt,
      isExpired,
      isExpiringSoon,
      canReturnToSupplier: Boolean(batch.supplierName),
      estimatedRetailValue: this.roundCurrency(
        batch.quantityOnHand * this.toNumber(batch.sellingPrice)
      ),
      estimatedCostValue: this.roundCurrency(
        batch.quantityOnHand * this.toNumber(batch.costPrice)
      ),
    };
  }

  private serializeDisposalRecord(
    adjustment: {
      id: string;
      reason: AdjustmentReason;
      notes: string | null;
      quantityDelta: number;
      createdAt: Date;
      medicine: {
        id: string;
        name: string;
      };
      stockBatch: {
        id: string;
        batchNumber: string;
        expiryDate: Date;
        quantityOnHand: number;
        supplierName: string | null;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
      };
      createdBy: {
        fullName: string;
      };
    },
    quantityAfter: number
  ) {
    const quantityRemoved = Math.abs(adjustment.quantityDelta);

    return {
      id: adjustment.id,
      reason: adjustment.reason,
      notes: adjustment.notes,
      quantityRemoved,
      quantityAfter,
      createdAt: adjustment.createdAt,
      createdBy: adjustment.createdBy.fullName,
      medicine: {
        id: adjustment.medicine.id,
        name: adjustment.medicine.name,
      },
      batch: {
        id: adjustment.stockBatch.id,
        batchNumber: adjustment.stockBatch.batchNumber,
        expiryDate: adjustment.stockBatch.expiryDate,
        currentQuantityOnHand: adjustment.stockBatch.quantityOnHand,
        supplierName: adjustment.stockBatch.supplierName,
      },
      estimatedRetailValueRemoved: this.roundCurrency(
        quantityRemoved * this.toNumber(adjustment.stockBatch.sellingPrice)
      ),
      estimatedCostValueRemoved: this.roundCurrency(
        quantityRemoved * this.toNumber(adjustment.stockBatch.costPrice)
      ),
    };
  }

  private validateAdjustmentDirection(
    reason: AdjustmentReason,
    quantityDelta: number
  ) {
    if (
      quantityDelta > 0 &&
      (reason === AdjustmentReason.DAMAGE ||
        reason === AdjustmentReason.EXPIRED ||
        reason === AdjustmentReason.RETURN_TO_SUPPLIER ||
        reason === AdjustmentReason.LOST ||
        reason === AdjustmentReason.THEFT_SUSPECTED)
    ) {
      throw new BadRequestException(
        "The selected reason can only reduce stock."
      );
    }
  }

  private mapAdjustmentMovementType(
    reason: AdjustmentReason,
    quantityDelta: number
  ) {
    if (reason === AdjustmentReason.DAMAGE) {
      return MovementType.DAMAGE;
    }

    if (reason === AdjustmentReason.EXPIRED) {
      return MovementType.EXPIRED;
    }

    if (reason === AdjustmentReason.RETURN_TO_SUPPLIER) {
      return MovementType.RETURN;
    }

    return quantityDelta > 0
      ? MovementType.ADJUSTMENT_IN
      : MovementType.ADJUSTMENT_OUT;
  }

  private asAuditRecord(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {} as Record<string, Prisma.JsonValue>;
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private asNumber(value: Prisma.JsonValue | null | undefined) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private getNearExpiryCutoff() {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    return cutoff;
  }

  private isExpired(value: Date) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return value.getTime() < todayStart.getTime();
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
