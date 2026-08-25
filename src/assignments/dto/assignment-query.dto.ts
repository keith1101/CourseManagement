import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssignmentStatus } from './assignment-status.enum';

export class AssignmentQueryDto {
    @IsOptional()
    @IsString()
    userId?: string;

    @IsOptional()
    @IsEnum(AssignmentStatus)
    status?: AssignmentStatus;
}
