import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";
import { USER_ROLES, type UserRole } from "@pharmahub/shared";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(USER_ROLES)
  role!: UserRole;

  @IsString()
  @IsOptional()
  branchId?: string;
}
