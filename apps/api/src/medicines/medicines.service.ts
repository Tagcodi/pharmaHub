import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
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
        sku: this.normalizeOptional(dto.sku),
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

  private normalizeOptional(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
