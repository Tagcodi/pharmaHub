import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class VoidSaleDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
