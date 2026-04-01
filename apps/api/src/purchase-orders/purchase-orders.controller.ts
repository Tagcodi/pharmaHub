import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { ReceivePurchaseOrderDto } from "./dto/receive-purchase-order.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("purchase-orders")
export class PurchaseOrdersController {
  private readonly purchaseOrdersService: PurchaseOrdersService;

  constructor(purchaseOrdersService: PurchaseOrdersService) {
    this.purchaseOrdersService = purchaseOrdersService;
  }

  @Get("catalog")
  @Roles("OWNER", "PHARMACIST")
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrdersService.getCatalog(user);
  }

  @Get()
  @Roles("OWNER", "PHARMACIST")
  getOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrdersService.getOrders(user);
  }

  @Post()
  @Roles("OWNER", "PHARMACIST")
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto
  ) {
    return this.purchaseOrdersService.createOrder(user, dto);
  }

  @Post(":purchaseOrderId/receive")
  @Roles("OWNER", "PHARMACIST")
  receiveOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("purchaseOrderId") purchaseOrderId: string,
    @Body() dto: ReceivePurchaseOrderDto
  ) {
    return this.purchaseOrdersService.receiveOrder(user, purchaseOrderId, dto);
  }
}
