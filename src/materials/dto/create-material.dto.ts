import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';

export class CreateMaterialDto {
    @IsString()
    @IsNotEmpty()
    subjectId!: string;

    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsEnum(MaterialType)
    materialType!: MaterialType;

    @IsOptional()
    @IsString()
    storageUrl?: string;

    @IsOptional()
    @IsString()
    embedUrl?: string;

    @IsOptional()
    @IsString()
    originalFileName?: string;

    @IsOptional()
    @IsString()
    mimeType?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    fileSizeBytes?: number;

    @IsEnum(AccessLevel)
    accessLevel!: AccessLevel;
}
