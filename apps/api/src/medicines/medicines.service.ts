import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import {
  appendIdentifierSequence,
  buildSkuBase,
  normalizeIdentifierInput,
} from "../common/utils/inventory-identifiers.util";
import type { CreateMedicineDto } from "./dto/create-medicine.dto";

@Injectable()
export class MedicinesService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listMedicines(currentUser: AuthenticatedUser) {
    const medicines = await this.prisma.medicine.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
      },
      orderBy: [
        { name: "asc" },
        { createdAt: "asc" },
      ],
    });

    return medicines.map((medicine) => ({
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
    }));
  }

  async createMedicine(currentUser: AuthenticatedUser, dto: CreateMedicineDto) {
    const normalizedName = dto.name.trim();
    const normalizedStrength = this.normalizeOptional(dto.strength);
    const normalizedForm = this.normalizeOptional(dto.form);
    const requestedSku = normalizeIdentifierInput(dto.sku);

    const existingMedicine = await this.prisma.medicine.findFirst({
      where: {
        pharmacyId: currentUser.pharmacyId,
        name: {
          equals: normalizedName,
          mode: "insensitive",
        },
        strength: normalizedStrength
          ? {
              equals: normalizedStrength,
              mode: "insensitive",
            }
          : null,
        form: normalizedForm
          ? {
              equals: normalizedForm,
              mode: "insensitive",
            }
          : null,
      },
    });

    if (existingMedicine) {
      throw new BadRequestException(
        "A medicine with the same name, strength, and form already exists."
      );
    }

    const medicine = await this.prisma.medicine.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        name: normalizedName,
        genericName: this.normalizeOptional(dto.genericName),
        brandName: this.normalizeOptional(dto.brandName),
        sku: requestedSku
          ? await this.ensureUniqueSku(currentUser.pharmacyId, requestedSku)
          : await this.generateUniqueSku(currentUser.pharmacyId, {
              name: normalizedName,
              strength: normalizedStrength,
              form: normalizedForm,
            }),
        form: normalizedForm,
        strength: normalizedStrength,
        category: this.normalizeOptional(dto.category),
        unit: this.normalizeOptional(dto.unit),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        branchId: currentUser.branchId,
        userId: currentUser.userId,
        action: AuditAction.MEDICINE_CREATED,
        entityType: "Medicine",
        entityId: medicine.id,
        metadata: {
          name: medicine.name,
          form: medicine.form,
          strength: medicine.strength,
          createdBy: currentUser.userId,
        },
      },
    });

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
    };
  }

  private async ensureUniqueSku(
    pharmacyId: string,
    sku: string,
    excludeMedicineId?: string
  ) {
    const existingMedicine = await this.prisma.medicine.findFirst({
      where: {
        pharmacyId,
        sku: {
          equals: sku,
          mode: "insensitive",
        },
        ...(excludeMedicineId
          ? {
              id: {
                not: excludeMedicineId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (existingMedicine) {
      throw new BadRequestException(
        "That SKU is already in use for another medicine."
      );
    }

    return sku;
  }

  private async generateUniqueSku(
    pharmacyId: string,
    input: {
      name: string;
      strength?: string | null;
      form?: string | null;
    },
    excludeMedicineId?: string
  ) {
    const base = buildSkuBase(input);

    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const candidate = appendIdentifierSequence(base, sequence);
      const existingMedicine = await this.prisma.medicine.findFirst({
        where: {
          pharmacyId,
          sku: {
            equals: candidate,
            mode: "insensitive",
          },
          ...(excludeMedicineId
            ? {
                id: {
                  not: excludeMedicineId,
                },
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

      if (!existingMedicine) {
        return candidate;
      }
    }

    throw new BadRequestException(
      "Unable to generate a unique SKU right now. Please enter one manually."
    );
  }

  private normalizeOptional(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
