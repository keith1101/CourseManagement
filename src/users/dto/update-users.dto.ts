import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString } from "class-validator";
import { AccessLevel, UserRole } from "../../../generated/client/enums";
import { User } from "../../../generated/client/client";

export class UpdateUsersDto {
    @IsOptional()
    @IsString()
    fullName!: string;

    @IsOptional()
    @IsEmail()
    email!: string;

    @IsOptional()
    @IsPhoneNumber()
    phone!: string;

    @IsOptional()
    @IsDateString()
    dateOfBirth?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role!: UserRole;

    @IsOptional()
    @IsBoolean()
    isActive!: boolean;

    @IsOptional()
    @IsEnum(AccessLevel)
    accessLevel?: AccessLevel;

    @IsOptional()
    @IsDateString()
    proExpiresAt?: string | null;
}
