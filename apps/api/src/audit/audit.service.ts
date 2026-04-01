import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import { serializeAuditItem } from "./audit.presenter";

@Injectable()
export class AuditService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getLogs(currentUser: AuthenticatedUser) {
    const branch = await this.resolveBranch(currentUser);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        pharmacyId: currentUser.pharmacyId,
        OR: [{ branchId: branch.id }, { branchId: null }],
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
      take: 50,
    });

    const items = logs.map((log) => serializeAuditItem(log));

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      metrics: {
        totalEvents: items.length,
        stockAdjustments: items.filter(
          (item) => item.action === AuditAction.STOCK_ADJUSTED
        ).length,
        suspectedLossEvents: logs.filter(
          (log) =>
            log.action === AuditAction.STOCK_ADJUSTED &&
            typeof log.metadata === "object" &&
            log.metadata !== null &&
            !Array.isArray(log.metadata) &&
            ["LOST", "THEFT_SUSPECTED"].includes(
              String((log.metadata as Record<string, unknown>).reason ?? "")
            )
        ).length,
        failedLoginCount: items.filter(
          (item) => item.action === AuditAction.LOGIN_FAILED
        ).length,
      },
      items,
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
}
