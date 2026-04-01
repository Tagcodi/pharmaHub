import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  Prisma,
  PurchaseOrderStatus,
  ReferenceType,
  MovementType,
} from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import {
  appendIdentifierSequence,
  buildBatchBase,
  normalizeIdentifierInput,
} from "../common/utils/inventory-identifiers.util";
import { PrismaService } from "../prisma/prisma.service";
import type { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import type { ReceivePurchaseOrderDto } from "./dto/receive-purchase-order.dto";

const LOW_STOCK_THRESHOLD = 20;
const REORDER_TARGET_QUANTITY = 40;

type PurchaseOrderWithDetails = {
  id: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  supplierName: string;
  notes: string | null;
  orderedAt: Date;
  receivedAt: Date | null;
  createdAt: Date;
  createdBy: {
    fullName: string;
  };
  items: Array<{
    id: string;
    requestedQuantity: number;
    receivedQuantity: number;
    unitCost: Prisma.Decimal;
    medicine: {
      id: string;
      name: string;
      genericName: string | null;
      form: string | null;
      strength: string | null;
      unit: string | null;
    };
  }>;
};

@Injectable()
export class PurchaseOrdersService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getCatalog(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);

    const [medicines, openOrders] = await Promise.all([
      this.prisma.medicine.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          isActive: true,
        },
        include: {
          stockBatches: {
            where: {
              branchId: branch.id,
            },
            orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          status: {
            in: [PurchaseOrderStatus.OPEN, PurchaseOrderStatus.PARTIALLY_RECEIVED],
          },
        },
        include: {
          items: true,
        },
      }),
    ]);

    const summarizedMedicines = medicines.map((medicine) => {
      const activeBatches = medicine.stockBatches.filter(
        (batch) => batch.quantityOnHand > 0
      );
      const totalQuantityOnHand = activeBatches.reduce(
        (sum, batch) => sum + batch.quantityOnHand,
        0
      );
      const latestBatch = medicine.stockBatches[0] ?? null;
      const isLowStock = totalQuantityOnHand <= LOW_STOCK_THRESHOLD;
      const recommendedOrderQuantity = isLowStock
        ? Math.max(REORDER_TARGET_QUANTITY - totalQuantityOnHand, 1)
        : 0;

      return {
        id: medicine.id,
        name: medicine.name,
        genericName: medicine.genericName,
        form: medicine.form,
        strength: medicine.strength,
        unit: medicine.unit,
        totalQuantityOnHand,
        activeBatchCount: activeBatches.length,
        isLowStock,
        recommendedOrderQuantity,
        lastSupplierName: latestBatch?.supplierName ?? null,
        lastCostPrice: latestBatch ? this.toNumber(latestBatch.costPrice) : null,
        lastSellingPrice: latestBatch
          ? this.toNumber(latestBatch.sellingPrice)
          : null,
        nextExpiryDate:
          activeBatches
            .slice()
            .sort((left, right) => left.expiryDate.getTime() - right.expiryDate.getTime())[0]
            ?.expiryDate ?? null,
      };
    });

    const outstandingUnits = openOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) =>
            itemSum + Math.max(item.requestedQuantity - item.receivedQuantity, 0),
          0
        ),
      0
    );

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalMedicines: summarizedMedicines.length,
        lowStockCount: summarizedMedicines.filter((medicine) => medicine.isLowStock)
          .length,
        recommendedOrderUnits: summarizedMedicines.reduce(
          (sum, medicine) => sum + medicine.recommendedOrderQuantity,
          0
        ),
        openOrderCount: openOrders.length,
        outstandingOrderUnits: outstandingUnits,
      },
      lowStockMedicines: summarizedMedicines.filter((medicine) => medicine.isLowStock),
      medicines: summarizedMedicines,
    };
  }

  async getOrders(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
      },
      include: {
        createdBy: {
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
                genericName: true,
                form: true,
                strength: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: [{ orderedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
    });

    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalOrders: serializedOrders.length,
        openOrders: serializedOrders.filter(
          (order) =>
            order.status === "OPEN" || order.status === "PARTIALLY_RECEIVED"
        ).length,
        receivedOrders: serializedOrders.filter(
          (order) => order.status === "RECEIVED"
        ).length,
        cancelledOrders: serializedOrders.filter(
          (order) => order.status === "CANCELLED"
        ).length,
        totalOrderedValue: this.roundCurrency(
          serializedOrders.reduce((sum, order) => sum + order.totalOrderedValue, 0)
        ),
        outstandingUnits: serializedOrders.reduce(
          (sum, order) => sum + order.outstandingQuantity,
          0
        ),
      },
      orders: serializedOrders,
    };
  }

  async createOrder(currentUser: AuthenticatedUser, dto: CreatePurchaseOrderDto) {
    const branch = await this.resolveBranch(currentUser);
    const supplierName = dto.supplierName.trim();
    const notes = this.normalizeOptional(dto.notes);
    const medicineIds = dto.items.map((item) => item.medicineId);

    if (new Set(medicineIds).size !== medicineIds.length) {
      throw new BadRequestException(
        "Each medicine can only appear once in a purchase order."
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const medicines = await tx.medicine.findMany({
        where: {
          pharmacyId: currentUser.pharmacyId,
          id: {
            in: medicineIds,
          },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          genericName: true,
          form: true,
          strength: true,
          unit: true,
        },
      });

      if (medicines.length !== medicineIds.length) {
        throw new BadRequestException(
          "One or more selected medicines were not found."
        );
      }

      const orderNumber = await this.generateOrderNumber(tx, currentUser, branch);

      const order = await tx.purchaseOrder.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          orderNumber,
          supplierName,
          notes,
          createdById: currentUser.userId,
          items: {
            create: dto.items.map((item) => ({
              medicineId: item.medicineId,
              requestedQuantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: {
          createdBy: {
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
                  genericName: true,
                  form: true,
                  strength: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.PURCHASE_ORDER_CREATED,
          entityType: "PurchaseOrder",
          entityId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            supplierName: order.supplierName,
            itemCount: order.items.length,
            totalRequestedQuantity: order.items.reduce(
              (sum, item) => sum + item.requestedQuantity,
              0
            ),
            totalOrderedValue: order.items.reduce(
              (sum, item) =>
                sum + item.requestedQuantity * this.toNumber(item.unitCost),
              0
            ),
          },
        },
      });

      return order;
    });

    return this.serializeOrder(result);
  }

  async receiveOrder(
    currentUser: AuthenticatedUser,
    purchaseOrderId: string,
    dto: ReceivePurchaseOrderDto
  ) {
    const branch = await this.resolveBranch(currentUser);
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException("A valid received date is required.");
    }

    const receiptKeys = dto.items.map((item) => item.purchaseOrderItemId);

    if (new Set(receiptKeys).size !== receiptKeys.length) {
      throw new BadRequestException(
        "Each purchase order item can only appear once in a receipt submission."
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: {
          id: purchaseOrderId,
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
        },
        include: {
          createdBy: {
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
                  genericName: true,
                  form: true,
                  strength: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException("Purchase order was not found.");
      }

      if (order.status === PurchaseOrderStatus.RECEIVED) {
        throw new BadRequestException("This purchase order has already been received.");
      }

      if (order.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException("Cancelled purchase orders cannot be received.");
      }

      const itemById = new Map(order.items.map((item) => [item.id, item]));
      let totalReceivedQuantity = 0;

      for (const receipt of dto.items) {
        const orderItem = itemById.get(receipt.purchaseOrderItemId);

        if (!orderItem) {
          throw new BadRequestException(
            "One or more receipt lines do not belong to this purchase order."
          );
        }

        const requestedBatchNumber = normalizeIdentifierInput(receipt.batchNumber);
        const expiryDate = new Date(receipt.expiryDate);

        if (Number.isNaN(expiryDate.getTime())) {
          throw new BadRequestException("A valid expiry date is required.");
        }

        const batchNumber = requestedBatchNumber
          ? await this.ensureUniqueBatchNumber(tx, {
              pharmacyId: currentUser.pharmacyId,
              branchId: branch.id,
              medicineId: orderItem.medicineId,
              batchNumber: requestedBatchNumber,
              medicineName: orderItem.medicine.name,
            })
          : await this.generateUniqueBatchNumber(tx, {
              pharmacyId: currentUser.pharmacyId,
              branchId: branch.id,
              medicineId: orderItem.medicineId,
              medicineName: orderItem.medicine.name,
              receivedAt,
            });

        if (expiryDate.getTime() <= receivedAt.getTime()) {
          throw new BadRequestException(
            `Expiry date for ${orderItem.medicine.name} batch ${batchNumber} must be after the received date.`
          );
        }

        const remainingQuantity =
          orderItem.requestedQuantity - orderItem.receivedQuantity;

        if (remainingQuantity <= 0) {
          throw new BadRequestException(
            `${orderItem.medicine.name} has already been fully received.`
          );
        }

        if (receipt.receivedQuantity > remainingQuantity) {
          throw new BadRequestException(
            `${orderItem.medicine.name} only has ${remainingQuantity} units remaining on this order.`
          );
        }

        const batch = await tx.stockBatch.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: orderItem.medicineId,
            batchNumber,
            expiryDate,
            quantityOnHand: receipt.receivedQuantity,
            costPrice: receipt.costPrice,
            sellingPrice: receipt.sellingPrice,
            supplierName: order.supplierName,
            receivedAt,
            createdById: currentUser.userId,
          },
        });

        await tx.stockMovement.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            medicineId: orderItem.medicineId,
            stockBatchId: batch.id,
            movementType: MovementType.STOCK_IN,
            referenceType: ReferenceType.STOCK_BATCH,
            referenceId: batch.id,
            quantityDelta: receipt.receivedQuantity,
            quantityAfter: receipt.receivedQuantity,
            createdById: currentUser.userId,
          },
        });

        await tx.purchaseOrderItem.update({
          where: {
            id: orderItem.id,
          },
          data: {
            receivedQuantity: {
              increment: receipt.receivedQuantity,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            pharmacyId: currentUser.pharmacyId,
            branchId: branch.id,
            userId: currentUser.userId,
            action: AuditAction.STOCK_BATCH_CREATED,
            entityType: "StockBatch",
            entityId: batch.id,
            metadata: {
              medicineId: orderItem.medicine.id,
              medicineName: orderItem.medicine.name,
              batchNumber: batch.batchNumber,
              quantity: receipt.receivedQuantity,
              costPrice: receipt.costPrice,
              sellingPrice: receipt.sellingPrice,
              supplierName: order.supplierName,
              purchaseOrderNumber: order.orderNumber,
            },
          },
        });

        totalReceivedQuantity += receipt.receivedQuantity;
      }

      const refreshedItems = order.items.map((item) => {
        const receivedLine = dto.items.find(
          (receipt) => receipt.purchaseOrderItemId === item.id
        );

        return {
          ...item,
          receivedQuantity:
            item.receivedQuantity + (receivedLine?.receivedQuantity ?? 0),
        };
      });

      const allReceived = refreshedItems.every(
        (item) => item.receivedQuantity >= item.requestedQuantity
      );
      const anyReceived = refreshedItems.some((item) => item.receivedQuantity > 0);
      const nextStatus = allReceived
        ? PurchaseOrderStatus.RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.PARTIALLY_RECEIVED
          : PurchaseOrderStatus.OPEN;

      const updatedOrder = await tx.purchaseOrder.update({
        where: {
          id: order.id,
        },
        data: {
          status: nextStatus,
          receivedAt:
            nextStatus === PurchaseOrderStatus.RECEIVED ? receivedAt : order.receivedAt,
        },
        include: {
          createdBy: {
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
                  genericName: true,
                  form: true,
                  strength: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          userId: currentUser.userId,
          action: AuditAction.PURCHASE_ORDER_RECEIVED,
          entityType: "PurchaseOrder",
          entityId: updatedOrder.id,
          metadata: {
            orderNumber: updatedOrder.orderNumber,
            supplierName: updatedOrder.supplierName,
            status: updatedOrder.status,
            lineCount: dto.items.length,
            totalReceivedQuantity,
          },
        },
      });

      return updatedOrder;
    });

    return this.serializeOrder(result);
  }

  private serializeOrder(order: PurchaseOrderWithDetails) {
    const totalRequestedQuantity = order.items.reduce(
      (sum, item) => sum + item.requestedQuantity,
      0
    );
    const totalReceivedQuantity = order.items.reduce(
      (sum, item) => sum + item.receivedQuantity,
      0
    );
    const totalOrderedValue = order.items.reduce(
      (sum, item) => sum + item.requestedQuantity * this.toNumber(item.unitCost),
      0
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      supplierName: order.supplierName,
      notes: order.notes,
      orderedAt: order.orderedAt,
      receivedAt: order.receivedAt,
      createdAt: order.createdAt,
      createdBy: order.createdBy.fullName,
      totalRequestedQuantity,
      totalReceivedQuantity,
      outstandingQuantity: Math.max(
        totalRequestedQuantity - totalReceivedQuantity,
        0
      ),
      totalOrderedValue: this.roundCurrency(totalOrderedValue),
      items: order.items.map((item) => ({
        id: item.id,
        requestedQuantity: item.requestedQuantity,
        receivedQuantity: item.receivedQuantity,
        outstandingQuantity: Math.max(
          item.requestedQuantity - item.receivedQuantity,
          0
        ),
        unitCost: this.toNumber(item.unitCost),
        lineValue: this.roundCurrency(
          item.requestedQuantity * this.toNumber(item.unitCost)
        ),
        medicine: {
          id: item.medicine.id,
          name: item.medicine.name,
          genericName: item.medicine.genericName,
          form: item.medicine.form,
          strength: item.medicine.strength,
          unit: item.medicine.unit,
        },
      })),
    };
  }

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedUser,
    branch: { id: string; code: string }
  ) {
    const count = await tx.purchaseOrder.count({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
      },
    });

    return `${branch.code}-PO-${String(count + 1).padStart(4, "0")}`;
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

  private normalizeOptional(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private async ensureUniqueBatchNumber(
    tx: Prisma.TransactionClient,
    input: {
      pharmacyId: string;
      branchId: string;
      medicineId: string;
      batchNumber: string;
      medicineName: string;
    }
  ) {
    const existingBatch = await tx.stockBatch.findFirst({
      where: {
        pharmacyId: input.pharmacyId,
        branchId: input.branchId,
        medicineId: input.medicineId,
        batchNumber: {
          equals: input.batchNumber,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (existingBatch) {
      throw new BadRequestException(
        `Batch ${input.batchNumber} already exists for ${input.medicineName}.`
      );
    }

    return input.batchNumber;
  }

  private async generateUniqueBatchNumber(
    tx: Prisma.TransactionClient,
    input: {
      pharmacyId: string;
      branchId: string;
      medicineId: string;
      medicineName: string;
      receivedAt: Date;
    }
  ) {
    const base = buildBatchBase({
      medicineName: input.medicineName,
      receivedAt: input.receivedAt,
    });

    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const candidate = appendIdentifierSequence(base, sequence);
      const existingBatch = await tx.stockBatch.findFirst({
        where: {
          pharmacyId: input.pharmacyId,
          branchId: input.branchId,
          medicineId: input.medicineId,
          batchNumber: {
            equals: candidate,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingBatch) {
        return candidate;
      }
    }

    throw new BadRequestException(
      `Unable to generate a unique batch number for ${input.medicineName}. Please enter one manually.`
    );
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (typeof value === "number") {
      return value;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }
}
