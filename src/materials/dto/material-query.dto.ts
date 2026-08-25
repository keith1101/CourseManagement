import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';

export class MaterialQueryDto {
    @IsOptional()
    @IsString()
    subjectId?: string;

    @IsOptional()
    @IsEnum(MaterialType)
    materialType?: MaterialType;

    @IsOptional()
    @IsEnum(AccessLevel)
    accessLevel?: AccessLevel;
}
