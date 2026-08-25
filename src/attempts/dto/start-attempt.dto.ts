import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartAttemptDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignmentId?: string;
}
