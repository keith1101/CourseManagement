import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { AccessLevel } from '../../../generated/client/enums';

export class UploadMaterialDto {
  @IsUUID()
  subjectId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(AccessLevel)
  accessLevel!: AccessLevel;
}
