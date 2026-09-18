import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class QuestionPartDto {
    @IsString()
    @IsNotEmpty()
    contentText!: string;

    @IsString()
    @IsNotEmpty()
    correctAnswer!: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    position?: number;
}
