import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { StockInDto } from "./dto/stock-in.dto";
import { InventoryService } from "./inventory.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventory")
export class InventoryController {
  private readonly inventoryService: InventoryService;

  constructor(inventoryService: InventoryService) {
    this.inventoryService = inventoryService;
  }

  @Get("summary")
  @Roles("OWNER", "PHARMACIST")
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getInventorySummary(user);
  }

  @Get("adjustment-catalog")
  @Roles("OWNER", "PHARMACIST")
  getAdjustmentCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getAdjustmentCatalog(user);
  }

  @Get("adjustments")
  @Roles("OWNER", "PHARMACIST")
  getAdjustments(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getAdjustments(user);
  }

  @Post("stock-in")
  @Roles("OWNER", "PHARMACIST")
  stockIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StockInDto
  ) {
    return this.inventoryService.stockIn(user, dto);
  }

  @Post("adjustments")
  @Roles("OWNER", "PHARMACIST")
  adjustStock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdjustStockDto
  ) {
    return this.inventoryService.adjustStock(user, dto);
  }
}
