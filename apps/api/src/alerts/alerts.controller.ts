import { Controller, Get, Headers, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { resolveLocale } from "../common/i18n/locale";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { AlertsService } from "./alerts.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("alerts")
export class AlertsController {
  private readonly alertsService: AlertsService;

  constructor(alertsService: AlertsService) {
    this.alertsService = alertsService;
  }

  @Get("overview")
  @Roles("OWNER", "PHARMACIST")
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-pharmahub-locale") localeHeader?: string
  ) {
    return this.alertsService.getOverview(user, resolveLocale(localeHeader));
  }
}
