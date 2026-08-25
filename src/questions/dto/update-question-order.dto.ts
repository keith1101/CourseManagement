import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateQuestionOrderDto {
    @Type(() => Number)
    @IsInt()
    @Min(0)
    order!: number;
}
