import { IsIn, IsOptional, IsString } from "class-validator";

const PRESCRIPTION_STATUSES = [
  "RECEIVED",
  "IN_REVIEW",
  "READY",
  "DISPENSED",
  "CANCELLED",
] as const;

export class UpdatePrescriptionStatusDto {
  @IsIn(PRESCRIPTION_STATUSES)
  status!: (typeof PRESCRIPTION_STATUSES)[number];

  @IsString()
  @IsOptional()
  notes?: string;
}
