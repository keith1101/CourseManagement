import {
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '../../../generated/client/enums';
import { QuestionOptionDto } from './question-option.dto';

export class CreateQuestionDto {
    @IsEnum(QuestionType)
    questionType!: QuestionType;

    @IsString()
    @IsNotEmpty()
    contentText!: string;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsString()
    instruction?: string;

    @IsOptional()
    @IsString()
    explaination?: string;

    @IsInt()
    @Min(1)
    timeLimitSeconds!: number;

    @IsOptional()
    @IsString()
    correctTextAnswer?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionOptionDto)
    options?: QuestionOptionDto[];
}
