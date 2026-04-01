import { AdjustmentReason } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

const DISPOSAL_REASONS = [
  AdjustmentReason.DAMAGE,
  AdjustmentReason.EXPIRED,
  AdjustmentReason.RETURN_TO_SUPPLIER,
] as const;

export class CreateDisposalDto {
  @IsString()
  @IsNotEmpty()
  stockBatchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsIn(DISPOSAL_REASONS)
  reason!: (typeof DISPOSAL_REASONS)[number];

  @IsString()
  @IsOptional()
  notes?: string;
}
