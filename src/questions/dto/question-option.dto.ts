import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class QuestionOptionDto {
    @IsOptional()
    @IsString()
    id?: string;

    @IsString()
    @IsNotEmpty()
    contentText!: string;

    @IsOptional()
    @IsBoolean()
    isCorrect?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    position?: number;
}

export class CreateQuestionOptionDto {
    @IsString()
    @IsNotEmpty()
    contentText!: string;

    @IsOptional()
    @IsBoolean()
    isCorrect?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    position?: number;
}

export class UpdateQuestionOptionDto {
    @IsOptional()
    @IsString()
    contentText?: string;

    @IsOptional()
    @IsBoolean()
    isCorrect?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    position?: number;
}
