import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { SalesRangeDto } from "./dto/sales-range.dto";
import { VoidSaleDto } from "./dto/void-sale.dto";
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

  @Get("reconciliation")
  @Roles("OWNER", "PHARMACIST")
  getReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesRangeDto
  ) {
    return this.salesService.getReconciliation(user, query);
  }

  @Get(":saleId/receipt")
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  getSaleReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param("saleId") saleId: string
  ) {
    return this.salesService.getSaleReceipt(user, saleId);
  }

  @Post()
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  createSale(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSaleDto
  ) {
    return this.salesService.createSale(user, dto);
  }

  @Patch(":saleId/void")
  @Roles("OWNER", "PHARMACIST")
  voidSale(
    @CurrentUser() user: AuthenticatedUser,
    @Param("saleId") saleId: string,
    @Body() dto: VoidSaleDto
  ) {
    return this.salesService.voidSale(user, saleId, dto);
  }
}
