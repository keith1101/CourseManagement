import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AccessLevel } from '../../../generated/client/enums';

export class CreateExamDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(AccessLevel)
    accessLevel?: AccessLevel;
}
