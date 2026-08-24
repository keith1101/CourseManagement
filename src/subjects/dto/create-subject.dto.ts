import { IsNotEmpty, IsString, IsOptional, Min, IsInt } from "class-validator";

export class CreateSubjectDto {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    code!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @Min(0)
    displayOrder!: number;
}