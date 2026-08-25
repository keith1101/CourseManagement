import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsDateString()
    dateOfBirth?: string;
}
