import { IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { QuestionType } from "../../../generated/client/enums";
import { Type } from "class-transformer";
export class UpdateQuestionsDto {
    @IsOptional()
    @IsString()
    examId!: string;

    @IsOptional()
    @IsEnum(QuestionType)
    questionType!: QuestionType;

    @IsOptional()
    @IsString()
    contextText!: string;

    @IsOptional()
    @IsString()
    imageUrl!: string;

    @IsOptional()
    @IsString()
    instruction!: string;
    
    @IsOptional()
    @IsString()
    explaination!: string;
    
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    timeLimitSeconds!: number;

    
}