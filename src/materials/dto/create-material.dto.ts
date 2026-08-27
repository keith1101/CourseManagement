import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Min,
  ValidateIf,
} from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';

const documentMaterial = (value: unknown) =>
  value === MaterialType.PDF || value === MaterialType.DOCX;

@ValidatorConstraint({ name: 'isHttpOrS3Url', async: false })
class IsHttpOrS3UrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;

    try {
      const url = new URL(value);
      const isSupportedProtocol = ['http:', 'https:', 's3:'].includes(
        url.protocol,
      );
      return isSupportedProtocol && Boolean(url.hostname) && url.pathname !== '/';
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be an http(s) or s3 URL`;
  }
}

function IsHttpOrS3Url(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: IsHttpOrS3UrlConstraint,
    });
  };
}

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
  @IsHttpOrS3Url()
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
