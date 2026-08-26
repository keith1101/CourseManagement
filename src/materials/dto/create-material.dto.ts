import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';

const documentMaterial = (value: unknown) =>
  value === MaterialType.PDF || value === MaterialType.DOCX;

export class CreateMaterialDto {
  @IsUUID()
  subjectId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(MaterialType)
  materialType!: MaterialType;

  @ValidateIf((object) => documentMaterial(object.materialType))
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  storageUrl?: string;

  @ValidateIf((object) => object.materialType === MaterialType.EMBEDDED_VIDEO)
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  embedUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  originalFileName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes?: number;

  @IsEnum(AccessLevel)
  accessLevel!: AccessLevel;
}
