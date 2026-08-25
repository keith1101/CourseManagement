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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';

@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectsController {

    constructor (private readonly subjectsService: SubjectsService) {}

    @Post()
    @Roles(UserRole.ADMIN)
    create(@Body() createSubjectDto: CreateSubjectDto) {
        return this.subjectsService.create(createSubjectDto);
    }

    @Get()
    @Roles(UserRole.STUDENT, UserRole.ADMIN)
    findAll() {
        return this.subjectsService.findAll();
    }

    @Get(':id')
    @Roles(UserRole.STUDENT, UserRole.ADMIN)
    findOne(@Param('id') id: string) {
        return this.subjectsService.findOne(id);
    }
    
    @Patch(':id')
    @Roles(UserRole.ADMIN)
    update(
        @Param('id') id: string,
        @Body() updateSubjectDto: UpdateSubjectDto,
    ) {
        return this.subjectsService.update(id, updateSubjectDto);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    remove (
        @Param('id') id: string,
    ) {
        return this.subjectsService.remove(id);
    }
    
}
