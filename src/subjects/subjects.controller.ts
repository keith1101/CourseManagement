import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@UseGuards(JwtAuthGuard)
@Controller('subjects')
export class SubjectsController {
    constructor(private readonly subjectsService: SubjectsService) {}

    @UseGuards(AdminGuard)
    @Post()
    create(@Body() createSubjectDto: CreateSubjectDto) {
        return this.subjectsService.create(createSubjectDto);
    }

    @Get()
    findAll() {
        return this.subjectsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.subjectsService.findOne(id);
    }

    @UseGuards(AdminGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateSubjectDto: UpdateSubjectDto,
    ) {
        return this.subjectsService.update(id, updateSubjectDto);
    }

    @UseGuards(AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.subjectsService.remove(id);
    }
}
