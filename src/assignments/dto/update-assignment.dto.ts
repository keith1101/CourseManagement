import { IsDateString } from 'class-validator';

export class UpdateAssignmentDto {
    @IsDateString()
    dueAt!: string;
}
