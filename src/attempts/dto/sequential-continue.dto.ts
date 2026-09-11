import { Type } from 'class-transformer';
import { Allow, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SequentialContinueDto {
    @IsString()
    questionId!: string;

    @Type(() => Number)
    @IsInt()
    @Min(0)
    progressVersion!: number;

    // Compatibility fields from pre-sequential clients are never used to
    // select the next question. The backend derives it from the attempt.
    @IsOptional()
    @Allow()
    questionIndex?: unknown;

    @IsOptional()
    @Allow()
    currentQuestion?: unknown;
}
