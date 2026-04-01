import { IsEnum } from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class DispensePrescriptionDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}
