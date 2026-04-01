import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { AuditService } from "./audit.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("audit")
export class AuditController {
  private readonly auditService: AuditService;

  constructor(auditService: AuditService) {
    this.auditService = auditService;
  }

  @Get("logs")
  @Roles("OWNER", "PHARMACIST")
  getLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.auditService.getLogs(user);
  }
}
