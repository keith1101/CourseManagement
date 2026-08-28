import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AttemptStatus } from '../../../generated/client/enums';

export class AttemptQueryDto {
    @IsOptional()
    @IsString()
    userId?: string;

    @IsOptional()
    @IsString()
    examId?: string;

    @IsOptional()
    @IsEnum(AttemptStatus)
    status?: AttemptStatus;
}
