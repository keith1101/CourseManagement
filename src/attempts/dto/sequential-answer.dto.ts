import { Type } from 'class-transformer';
import {
    Allow,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { AnswerValueType } from '../../../generated/client/enums';

/** Fields accepted by graded sequential submissions. */
export class SequentialAnswerDto {
    @IsString()
    questionId!: string;

    @Type(() => Number)
    @IsInt()
    @Min(0)
    progressVersion!: number;

    @IsOptional()
    @IsString()
    selectedOptionId?: string;

    @IsOptional()
    @IsEnum(AnswerValueType)
    answerType?: AnswerValueType;

    @IsOptional()
    @IsString()
    rawValue?: string;

    @IsOptional()
    @IsString()
    normalizedText?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    numericValue?: number;

    // Older clients may still send navigation hints. They are accepted only
    // for compatibility and are deliberately ignored by the service; the
    // server-owned progress row determines the question being mutated.
    @IsOptional()
    @Allow()
    questionIndex?: unknown;

    @IsOptional()
    @Allow()
    currentQuestion?: unknown;
}
