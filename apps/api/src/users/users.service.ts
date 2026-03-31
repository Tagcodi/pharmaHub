import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import type { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  private readonly prisma: PrismaService;
  private readonly configService: ConfigService;

  constructor(
    prisma: PrismaService,
    configService: ConfigService
  ) {
    this.prisma = prisma;
    this.configService = configService;
  }

  async listUsers(currentUser: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId
      },
      include: {
        branch: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
            code: user.branch.code
          }
        : null,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    }));
  }

  async createUser(currentUser: AuthenticatedUser, dto: CreateUserDto) {
    if (dto.role === UserRole.OWNER) {
      throw new BadRequestException("New owner accounts cannot be created from this endpoint.");
    }

    const branchId = dto.branchId ?? currentUser.branchId;

    if (!branchId) {
      throw new BadRequestException("A branch is required when creating a user.");
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        pharmacyId: currentUser.pharmacyId
      }
    });

    if (!branch) {
      throw new NotFoundException("The specified branch was not found.");
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        pharmacyId: currentUser.pharmacyId,
        email: dto.email.trim().toLowerCase()
      }
    });

    if (existingUser) {
      throw new BadRequestException("A user with that email already exists in this pharmacy.");
    }

    const saltRounds = Number(this.configService.get("PASSWORD_SALT_ROUNDS") ?? 12);
    const passwordHash = await hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        branchId,
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        role: dto.role
      },
      include: {
        branch: true
      }
    });

    await this.prisma.auditLog.create({
      data: {
        pharmacyId: currentUser.pharmacyId,
        branchId,
        userId: currentUser.userId,
        action: AuditAction.USER_CREATED,
        entityType: "User",
        entityId: user.id,
        metadata: {
          role: user.role,
          createdBy: currentUser.userId
        }
      }
    });

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
            code: user.branch.code
          }
        : null
    };
  }
}
