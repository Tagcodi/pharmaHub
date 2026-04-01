import { Controller, Get, Headers, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { resolveLocale } from "../common/i18n/locale";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { DashboardService } from "./dashboard.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  private readonly dashboardService: DashboardService;

  constructor(dashboardService: DashboardService) {
    this.dashboardService = dashboardService;
  }

  @Get("overview")
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-pharmahub-locale") localeHeader?: string
  ) {
    return this.dashboardService.getOverview(user, resolveLocale(localeHeader));
  }
}
