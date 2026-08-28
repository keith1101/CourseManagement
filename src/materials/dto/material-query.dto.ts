import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';

export class MaterialQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsEnum(MaterialType)
  materialType?: MaterialType;

  @IsOptional()
  @IsEnum(AccessLevel)
  accessLevel?: AccessLevel;
}
