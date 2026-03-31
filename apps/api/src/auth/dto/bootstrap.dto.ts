import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";

export class BootstrapDto {
  @IsString()
  @IsNotEmpty()
  pharmacyName!: string;

  @IsString()
  @IsOptional()
  pharmacySlug?: string;

  @IsString()
  @IsOptional()
  branchName?: string;

  @IsString()
  @IsOptional()
  branchAddress?: string;

  @IsString()
  @IsNotEmpty()
  ownerFullName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;
}
