import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CycleCountDto {
  @IsString()
  @IsNotEmpty()
  stockBatchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
