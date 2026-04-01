import { AdjustmentReason } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  stockBatchId!: string;

  @Type(() => Number)
  @IsInt()
  quantityDelta!: number;

  @IsEnum(AdjustmentReason)
  reason!: AdjustmentReason;

  @IsString()
  @IsOptional()
  notes?: string;
}
