import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { QuestionType } from '../../../generated/client/enums';

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
}
