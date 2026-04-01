import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  Prisma,
} from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import type { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import type { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";
import type { UpdatePrescriptionStatusDto } from "./dto/update-prescription-status.dto";

const LOW_STOCK_THRESHOLD = 20;
type PrescriptionStatusValue =
  | "RECEIVED"
  | "IN_REVIEW"
  | "READY"
  | "DISPENSED"
  | "CANCELLED";

type PrescriptionWithDetails = {
  id: string;
  prescriptionNumber: string;
  patientName: string;
  patientPhone: string | null;
  prescriberName: string | null;
  notes: string | null;
  status: PrescriptionStatusValue;
  receivedAt: Date;
  promisedAt: Date | null;
  preparedAt: Date | null;
  dispensedAt: Date | null;
  createdAt: Date;
  createdBy: {
    fullName: string;
  };
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: Prisma.Decimal;
    paymentMethod: string;
    soldAt: Date;
    status: string;
  } | null;
  items: Array<{
    id: string;
    medicineId: string | null;
    medicineName: string;
    quantity: number;
    instructions: string | null;
    medicine: {
      id: string;
      genericName: string | null;
      form: string | null;
      strength: string | null;
      unit: string | null;
    } | null;
  }>;
};

@Injectable()
export class PrescriptionsService {
  private readonly prisma: PrismaService;
  private readonly salesService: SalesService;

  constructor(prisma: PrismaService, salesService: SalesService) {
    this.prisma = prisma;
    this.salesService = salesService;
  }

  async getCatalog(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const medicines = await this.prisma.medicine.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        isActive: true,
      },
      include: {
        stockBatches: {
          where: {
            branchId: branch.id,
          },
          orderBy: [{ expiryDate: "asc" }, { receivedAt: "desc" }],
        },
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });

    const summarizedMedicines = medicines.map((medicine) => {
      const activeBatches = medicine.stockBatches.filter(
        (batch) => batch.quantityOnHand > 0
      );
      const totalQuantityOnHand = activeBatches.reduce(
        (sum, batch) => sum + batch.quantityOnHand,
        0
      );
      const nextExpiryBatch = activeBatches[0] ?? null;

      return {
        id: medicine.id,
        name: medicine.name,
        genericName: medicine.genericName,
        form: medicine.form,
        strength: medicine.strength,
        unit: medicine.unit,
        totalQuantityOnHand,
        activeBatchCount: activeBatches.length,
        isLowStock: totalQuantityOnHand <= LOW_STOCK_THRESHOLD,
        nextExpiryDate: nextExpiryBatch?.expiryDate ?? null,
        currentSellingPrice: nextExpiryBatch
          ? this.toNumber(nextExpiryBatch.sellingPrice)
          : null,
      };
    });

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalMedicines: summarizedMedicines.length,
        stockedMedicines: summarizedMedicines.filter(
          (medicine) => medicine.totalQuantityOnHand > 0
        ).length,
        lowStockCount: summarizedMedicines.filter((medicine) => medicine.isLowStock)
          .length,
      },
      medicines: summarizedMedicines,
    };
  }

  async getQueue(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const prescriptionModel = (this.prisma as PrismaService & {
      prescription: {
        findMany: (args: unknown) => Promise<PrescriptionWithDetails[]>;
      };
    }).prescription;
    const prescriptions = await prescriptionModel.findMany({
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
        sale: {
          select: {
            id: true,
            saleNumber: true,
            totalAmount: true,
            paymentMethod: true,
            soldAt: true,
            status: true,
          },
        },
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                genericName: true,
                form: true,
                strength: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
    });

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalPrescriptions: prescriptions.length,
        activeQueueCount: prescriptions.filter(
          (prescription: PrescriptionWithDetails) =>
            prescription.status !== "DISPENSED" &&
            prescription.status !== "CANCELLED"
        ).length,
        receivedCount: prescriptions.filter(
          (prescription: PrescriptionWithDetails) => prescription.status === "RECEIVED"
        ).length,
        inReviewCount: prescriptions.filter(
          (prescription: PrescriptionWithDetails) => prescription.status === "IN_REVIEW"
        ).length,
        readyCount: prescriptions.filter(
          (prescription: PrescriptionWithDetails) => prescription.status === "READY"
        ).length,
        dispensedTodayCount: prescriptions.filter(
          (prescription: PrescriptionWithDetails) =>
            prescription.dispensedAt &&
            prescription.dispensedAt >= this.startOfToday()
        ).length,
      },
      prescriptions: prescriptions.map((prescription) =>
        this.serializePrescription(prescription)
      ),
    };
  }

  async createPrescription(
    currentUser: AuthenticatedUser,
    dto: CreatePrescriptionDto
  ) {
    const branch = await this.resolveBranch(currentUser);
    const patientName = this.normalizeRequired(
      dto.patientName,
      "Patient name is required."
    );
    const patientPhone = this.normalizeOptional(dto.patientPhone);
    const prescriberName = this.normalizeOptional(dto.prescriberName);
    const notes = this.normalizeOptional(dto.notes);
    const promisedAt = dto.promisedAt ? new Date(dto.promisedAt) : null;

    if (promisedAt && Number.isNaN(promisedAt.getTime())) {
      throw new BadRequestException("A valid promised time is required.");
    }

    const medicineIds = dto.items.map((item) => item.medicineId);
    if (new Set(medicineIds).size !== medicineIds.length) {
      throw new BadRequestException(
        "Each medicine can only appear once in a prescription."
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const prescriptionTx = tx as Prisma.TransactionClient & {
        prescription: {
          create: (args: unknown) => Promise<PrescriptionWithDetails>;
          count: (args: unknown) => Promise<number>;
          findFirst: (args: unknown) => Promise<PrescriptionWithDetails | null>;
          update: (args: unknown) => Promise<PrescriptionWithDetails>;
        };
      };
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

      const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]));
      const prescriptionNumber = await this.generatePrescriptionNumber(
        prescriptionTx,
        currentUser,
        branch
      );

      const prescription = await prescriptionTx.prescription.create({
        data: {
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
          prescriptionNumber,
          patientName,
          patientPhone,
          prescriberName,
          notes,
          promisedAt,
          createdById: currentUser.userId,
          items: {
            create: dto.items.map((item) => {
              const medicine = medicineById.get(item.medicineId);

              return {
                medicineId: item.medicineId,
                medicineName: medicine?.name ?? "Unknown medicine",
                quantity: item.quantity,
                instructions: this.normalizeOptional(item.instructions),
              };
            }),
          },
        },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              paymentMethod: true,
              soldAt: true,
              status: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
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
          action: "PRESCRIPTION_CREATED" as AuditAction,
          entityType: "Prescription",
          entityId: prescription.id,
          metadata: {
            prescriptionNumber: prescription.prescriptionNumber,
            patientName: prescription.patientName,
            status: prescription.status,
            itemCount: prescription.items.length,
          },
        },
      });

      return prescription;
    });

    return this.serializePrescription(result);
  }

  async dispensePrescription(
    currentUser: AuthenticatedUser,
    prescriptionId: string,
    dto: DispensePrescriptionDto
  ) {
    const branch = await this.resolveBranch(currentUser);

    const result = await this.prisma.$transaction(async (tx) => {
      const prescriptionTx = tx as Prisma.TransactionClient & {
        prescription: {
          findFirst: (args: unknown) => Promise<PrescriptionWithDetails | null>;
          update: (args: unknown) => Promise<PrescriptionWithDetails>;
        };
      };

      const prescription = await prescriptionTx.prescription.findFirst({
        where: {
          id: prescriptionId,
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
        },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              paymentMethod: true,
              soldAt: true,
              status: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
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

      if (!prescription) {
        throw new NotFoundException("Prescription was not found.");
      }

      if (prescription.status === "DISPENSED") {
        throw new BadRequestException(
          "This prescription has already been dispensed."
        );
      }

      if (prescription.status === "CANCELLED") {
        throw new BadRequestException(
          "Cancelled prescriptions cannot be dispensed."
        );
      }

      if (prescription.status !== "READY") {
        throw new BadRequestException(
          "Move the prescription to Ready before dispensing it."
        );
      }

      if (prescription.sale) {
        throw new BadRequestException(
          "This prescription already has a linked sale."
        );
      }

      const missingMedicine = prescription.items.find((item) => !item.medicineId);

      if (missingMedicine) {
        throw new BadRequestException(
          `${missingMedicine.medicineName} is no longer linked to an active catalog medicine.`
        );
      }

      const sale = await this.salesService.createSaleRecordInTransaction(
        tx,
        currentUser,
        branch,
        {
          paymentMethod: dto.paymentMethod,
          prescriptionId: prescription.id,
          items: prescription.items.map((item) => ({
            medicineId: item.medicineId!,
            quantity: item.quantity,
          })),
        }
      );

      const updatedPrescription = await prescriptionTx.prescription.update({
        where: {
          id: prescription.id,
        },
        data: {
          status: "DISPENSED",
          dispensedAt: sale.sale.soldAt,
        },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              paymentMethod: true,
              soldAt: true,
              status: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
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
          action: AuditAction.PRESCRIPTION_STATUS_UPDATED,
          entityType: "Prescription",
          entityId: prescription.id,
          metadata: {
            prescriptionNumber: prescription.prescriptionNumber,
            patientName: prescription.patientName,
            previousStatus: prescription.status,
            status: updatedPrescription.status,
            saleNumber: sale.sale.saleNumber,
            paymentMethod: sale.sale.paymentMethod,
          },
        },
      });

      return {
        prescription: updatedPrescription,
        sale: {
          id: sale.sale.id,
          saleNumber: sale.sale.saleNumber,
          totalAmount: this.roundCurrency(this.toNumber(sale.sale.totalAmount)),
          paymentMethod: sale.sale.paymentMethod,
          soldAt: sale.sale.soldAt,
          items: sale.items,
        },
      };
    });

    return {
      prescription: this.serializePrescription(result.prescription),
      sale: result.sale,
    };
  }

  async updateStatus(
    currentUser: AuthenticatedUser,
    prescriptionId: string,
    dto: UpdatePrescriptionStatusDto
  ) {
    const branch = await this.resolveBranch(currentUser);
    const notes = this.normalizeOptional(dto.notes);

    const result = await this.prisma.$transaction(async (tx) => {
      const prescriptionTx = tx as Prisma.TransactionClient & {
        prescription: {
          findFirst: (args: unknown) => Promise<PrescriptionWithDetails | null>;
          update: (args: unknown) => Promise<PrescriptionWithDetails>;
        };
      };
      const prescription = await prescriptionTx.prescription.findFirst({
        where: {
          id: prescriptionId,
          pharmacyId: currentUser.pharmacyId,
          branchId: branch.id,
        },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              paymentMethod: true,
              soldAt: true,
              status: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
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

      if (!prescription) {
        throw new NotFoundException("Prescription was not found.");
      }

      if (dto.status === "DISPENSED") {
        throw new BadRequestException(
          "Use the prescription dispensing flow to create the sale and mark it as dispensed."
        );
      }

      if (prescription.status === "DISPENSED") {
        throw new BadRequestException(
          "Dispensed prescriptions cannot move back to another status."
        );
      }

      if (
        prescription.status === "CANCELLED" &&
        dto.status !== "CANCELLED"
      ) {
        throw new BadRequestException(
          "Cancelled prescriptions cannot be re-opened."
        );
      }

      const updatedPrescription = await prescriptionTx.prescription.update({
        where: {
          id: prescription.id,
        },
        data: {
          status: dto.status,
          notes: notes ?? prescription.notes,
          preparedAt:
            dto.status === "READY"
              ? prescription.preparedAt ?? new Date()
              : prescription.preparedAt,
          dispensedAt: prescription.dispensedAt,
        },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              paymentMethod: true,
              soldAt: true,
              status: true,
            },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
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
          action: "PRESCRIPTION_STATUS_UPDATED" as AuditAction,
          entityType: "Prescription",
          entityId: prescription.id,
          metadata: {
            prescriptionNumber: prescription.prescriptionNumber,
            patientName: prescription.patientName,
            previousStatus: prescription.status,
            status: updatedPrescription.status,
          },
        },
      });

      return updatedPrescription;
    });

    return this.serializePrescription(result);
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

  private serializePrescription(prescription: PrescriptionWithDetails) {
    return {
      id: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      patientName: prescription.patientName,
      patientPhone: prescription.patientPhone,
      prescriberName: prescription.prescriberName,
      notes: prescription.notes,
      status: prescription.status,
      receivedAt: prescription.receivedAt,
      promisedAt: prescription.promisedAt,
      preparedAt: prescription.preparedAt,
      dispensedAt: prescription.dispensedAt,
      createdAt: prescription.createdAt,
      createdBy: prescription.createdBy.fullName,
      itemCount: prescription.items.length,
      totalRequestedUnits: prescription.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
      sale: prescription.sale
        ? {
            id: prescription.sale.id,
            saleNumber: prescription.sale.saleNumber,
            totalAmount: this.roundCurrency(this.toNumber(prescription.sale.totalAmount)),
            paymentMethod: prescription.sale.paymentMethod,
            soldAt: prescription.sale.soldAt,
            status: prescription.sale.status,
          }
        : null,
      items: prescription.items.map((item) => ({
        id: item.id,
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        quantity: item.quantity,
        instructions: item.instructions,
        medicine: item.medicine
          ? {
              id: item.medicine.id,
              genericName: item.medicine.genericName,
              form: item.medicine.form,
              strength: item.medicine.strength,
              unit: item.medicine.unit,
            }
          : null,
      })),
    };
  }

  private async generatePrescriptionNumber(
    tx: Prisma.TransactionClient & {
      prescription: {
        count: (args: unknown) => Promise<number>;
      };
    },
    currentUser: AuthenticatedUser,
    branch: {
      id: string;
      code: string;
    }
  ) {
    const count = await tx.prescription.count({
      where: {
        pharmacyId: currentUser.pharmacyId,
        branchId: branch.id,
      },
    });

    return `${branch.code}-RX-${String(count + 1).padStart(4, "0")}`;
  }

  private startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private normalizeOptional(value?: string | null) {
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
