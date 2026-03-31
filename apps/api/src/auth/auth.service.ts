import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { AuditAction, UserRole } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import type { AuthTokenPayload } from "@pharmahub/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { toSlug } from "../common/utils/slug.util";
import type { SetupDto } from "./dto/setup.dto";
import type { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  private readonly prisma: PrismaService;
  private readonly jwtService: JwtService;
  private readonly configService: ConfigService;

  constructor(
    prisma: PrismaService,
    jwtService: JwtService,
    configService: ConfigService
  ) {
    this.prisma = prisma;
    this.jwtService = jwtService;
    this.configService = configService;
  }

  async getSetupStatus() {
    const userCount = await this.prisma.user.count();

    return {
      isSetupComplete: userCount > 0
    };
  }

  async setup(dto: SetupDto) {
    const existingUsers = await this.prisma.user.count();

    if (existingUsers > 0) {
      throw new BadRequestException("The system has already been set up.");
    }

    const pharmacySlug = toSlug(dto.pharmacySlug ?? dto.pharmacyName);

    if (!pharmacySlug) {
      throw new BadRequestException("A valid pharmacy slug is required.");
    }

    const existingPharmacy = await this.prisma.pharmacy.findUnique({
      where: {
        slug: pharmacySlug
      }
    });

    if (existingPharmacy) {
      throw new BadRequestException("That pharmacy slug is already in use.");
    }

    const passwordHash = await this.hashPassword(dto.ownerPassword);

    const result = await this.prisma.$transaction(async (tx) => {
      const pharmacy = await tx.pharmacy.create({
        data: {
          name: dto.pharmacyName.trim(),
          slug: pharmacySlug
        }
      });

      const branch = await tx.branch.create({
        data: {
          pharmacyId: pharmacy.id,
          name: dto.branchName?.trim() || "Main Branch",
          code: "MAIN",
          address: dto.branchAddress?.trim() || null,
          isDefault: true
        }
      });

      const owner = await tx.user.create({
        data: {
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          fullName: dto.ownerFullName.trim(),
          email: dto.ownerEmail.trim().toLowerCase(),
          passwordHash,
          role: UserRole.OWNER
        }
      });

      await tx.auditLog.createMany({
        data: [
          {
            pharmacyId: pharmacy.id,
            branchId: branch.id,
            userId: owner.id,
            action: AuditAction.PHARMACY_SETUP_COMPLETED,
            entityType: "Pharmacy",
            entityId: pharmacy.id,
            metadata: {
              slug: pharmacy.slug
            }
          },
          {
            pharmacyId: pharmacy.id,
            branchId: branch.id,
            userId: owner.id,
            action: AuditAction.USER_CREATED,
            entityType: "User",
            entityId: owner.id,
            metadata: {
              role: owner.role
            }
          }
        ]
      });

      return {
        pharmacy,
        branch,
        owner
      };
    });

    return this.buildAuthResponse(result.owner, result.pharmacy, result.branch);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email.trim().toLowerCase()
      },
      include: {
        pharmacy: true,
        branch: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("This user account is inactive.");
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      await this.prisma.auditLog.create({
        data: {
          pharmacyId: user.pharmacyId,
          branchId: user.branchId,
          userId: user.id,
          action: AuditAction.LOGIN_FAILED,
          entityType: "User",
          entityId: user.id
        }
      });

      throw new UnauthorizedException("Invalid email or password.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          lastLoginAt: new Date()
        }
      }),
      this.prisma.auditLog.create({
        data: {
          pharmacyId: user.pharmacyId,
          branchId: user.branchId,
          userId: user.id,
          action: AuditAction.LOGIN_SUCCESS,
          entityType: "User",
          entityId: user.id
        }
      })
    ]);

    return this.buildAuthResponse(user, user.pharmacy, user.branch);
  }

  async getCurrentSession(user: AuthenticatedUser) {
    const currentUser = await this.prisma.user.findUnique({
      where: {
        id: user.userId
      },
      include: {
        pharmacy: true,
        branch: true
      }
    });

    if (!currentUser) {
      throw new NotFoundException("Authenticated user was not found.");
    }

    return {
      user: this.serializeUser(currentUser),
      pharmacy: {
        id: currentUser.pharmacy.id,
        name: currentUser.pharmacy.name,
        slug: currentUser.pharmacy.slug
      },
      branch: currentUser.branch
        ? {
            id: currentUser.branch.id,
            name: currentUser.branch.name,
            code: currentUser.branch.code
          }
        : null
    };
  }

  private async hashPassword(password: string) {
    const saltRounds = Number(this.configService.get("PASSWORD_SALT_ROUNDS") ?? 12);
    return hash(password, saltRounds);
  }

  private async signToken(payload: AuthTokenPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      expiresIn: (this.configService.get<string>("JWT_EXPIRES_IN") ?? "1d") as JwtSignOptions["expiresIn"]
    });
  }

  private async buildAuthResponse(
    user: {
      id: string;
      pharmacyId: string;
      branchId: string | null;
      role: UserRole;
      email: string;
      fullName: string;
      isActive: boolean;
    },
    pharmacy: {
      id: string;
      name: string;
      slug: string;
    },
    branch: {
      id: string;
      name: string;
      code: string;
    } | null
  ) {
    const accessToken = await this.signToken({
      sub: user.id,
      pharmacyId: user.pharmacyId,
      branchId: user.branchId,
      role: user.role,
      email: user.email
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      },
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        slug: pharmacy.slug
      },
      branch: branch
        ? {
            id: branch.id,
            name: branch.name,
            code: branch.code
          }
        : null
    };
  }

  private serializeUser(user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    lastLoginAt: Date | null;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt
    };
  }
}
