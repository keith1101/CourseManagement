import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
        role: string;
    };
};

@UseGuards(JwtAuthGuard)
@Controller('exams')
export class ExamsController {
    constructor(private readonly examsService: ExamsService) {}

    @UseGuards(AdminGuard)
    @Post()
    create(@Body() createExamDto: CreateExamDto) {
        return this.examsService.create(createExamDto);
    }

    @Get()
    findAll(
        @Query() query: ExamQueryDto,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.examsService.findAll(query, request.user.role);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.examsService.findOne(id);
    }

    @UseGuards(AdminGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateExamDto: UpdateExamDto,
    ) {
        return this.examsService.update(id, updateExamDto);
    }

    @UseGuards(AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.examsService.remove(id);
    }

    @UseGuards(AdminGuard)
    @Patch(':id/publish')
    publish(@Param('id') id: string) {
        return this.examsService.publish(id);
    }

    @UseGuards(AdminGuard)
    @Patch(':id/unpublish')
    unpublish(@Param('id') id: string) {
        return this.examsService.unpublish(id);
    }
}
