import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";
import { UpdatePrescriptionStatusDto } from "./dto/update-prescription-status.dto";
import { PrescriptionsService } from "./prescriptions.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("prescriptions")
export class PrescriptionsController {
  private readonly prescriptionsService: PrescriptionsService;

  constructor(prescriptionsService: PrescriptionsService) {
    this.prescriptionsService = prescriptionsService;
  }

  @Get("catalog")
  @Roles("OWNER", "PHARMACIST")
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.prescriptionsService.getCatalog(user);
  }

  @Get()
  @Roles("OWNER", "PHARMACIST")
  getQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.prescriptionsService.getQueue(user);
  }

  @Post()
  @Roles("OWNER", "PHARMACIST")
  createPrescription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePrescriptionDto
  ) {
    return this.prescriptionsService.createPrescription(user, dto);
  }

  @Post(":prescriptionId/dispense")
  @Roles("OWNER", "PHARMACIST")
  dispensePrescription(
    @CurrentUser() user: AuthenticatedUser,
    @Param("prescriptionId") prescriptionId: string,
    @Body() dto: DispensePrescriptionDto
  ) {
    return this.prescriptionsService.dispensePrescription(
      user,
      prescriptionId,
      dto
    );
  }

  @Patch(":prescriptionId/status")
  @Roles("OWNER", "PHARMACIST")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("prescriptionId") prescriptionId: string,
    @Body() dto: UpdatePrescriptionStatusDto
  ) {
    return this.prescriptionsService.updateStatus(user, prescriptionId, dto);
  }
}
