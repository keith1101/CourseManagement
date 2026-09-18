import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { AnswerValueType } from '../../../generated/client/enums';

export class SaveAttemptPartAnswerDto {
    @IsString()
    @MinLength(1)
    partId!: string;

    @IsString()
    rawValue!: string;
}

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

    @IsOptional()
    @IsBoolean()
    finalize?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SaveAttemptPartAnswerDto)
    parts?: SaveAttemptPartAnswerDto[];
}
