import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { ReportRangeDto } from "./dto/report-range.dto";
import { ReportsService } from "./reports.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reports")
export class ReportsController {
  private readonly reportsService: ReportsService;

  constructor(reportsService: ReportsService) {
    this.reportsService = reportsService;
  }

  @Get("summary")
  @Roles("OWNER", "PHARMACIST")
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportRangeDto
  ) {
    return this.reportsService.getSummary(user, query);
  }

  @Get("export.csv")
  @Roles("OWNER", "PHARMACIST")
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportRangeDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const csv = await this.reportsService.exportCsv(user, query);
    const rangeDays = query.rangeDays ?? 30;

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename=\"pharmahub-report-${rangeDays}d.csv\"`
    );

    return csv;
  }
}
