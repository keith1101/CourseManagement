import { IsEnum, IsOptional } from 'class-validator';
import { ExamStatus } from '../../../generated/client/enums';

export class ExamQueryDto {
    @IsOptional()
    @IsEnum(ExamStatus)
    status?: ExamStatus;
}
