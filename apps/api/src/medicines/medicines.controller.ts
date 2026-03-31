import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { CreateMedicineDto } from "./dto/create-medicine.dto";
import { MedicinesService } from "./medicines.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("OWNER", "PHARMACIST")
@Controller("medicines")
export class MedicinesController {
  private readonly medicinesService: MedicinesService;

  constructor(medicinesService: MedicinesService) {
    this.medicinesService = medicinesService;
  }

  @Get()
  listMedicines(@CurrentUser() user: AuthenticatedUser) {
    return this.medicinesService.listMedicines(user);
  }

  @Post()
  createMedicine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicineDto
  ) {
    return this.medicinesService.createMedicine(user, dto);
  }
}
