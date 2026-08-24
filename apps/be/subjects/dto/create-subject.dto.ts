import { IsNotEmpty, IsString, IsOptional } from "class-validator";

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

}