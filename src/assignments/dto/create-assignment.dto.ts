import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateAssignmentDto {
    @IsString()
    @IsNotEmpty()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    examId!: string;

    @IsDateString()
    dueAt!: string;
}
