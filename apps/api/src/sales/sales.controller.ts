import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { SalesService } from "./sales.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("sales")
export class SalesController {
  private readonly salesService: SalesService;

  constructor(salesService: SalesService) {
    this.salesService = salesService;
  }

  @Get("catalog")
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.getCatalog(user);
  }

  @Get("overview")
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.getOverview(user);
  }

  @Post()
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  createSale(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSaleDto
  ) {
    return this.salesService.createSale(user, dto);
  }
}
