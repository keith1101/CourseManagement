import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AnswerValueType } from '../../../generated/client/enums';

export class SaveAttemptAnswerDto {
    @IsString()
    @MinLength(1)
    questionId!: string;

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

    @IsOptional()
    @IsBoolean()
    timedOut?: boolean;
}
