import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @IsNotEmpty()
    fullName!: string;

    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' && value.trim() ? value.trim() : undefined,
    )
    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsDateString()
    dateOfBirth?: string;
}
