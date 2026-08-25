import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';

@UseGuards(JwtAuthGuard)
@Controller('exams/:examId/questions')
export class ExamQuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Get()
    findByExam(@Param('examId') examId: string) {
        return this.questionsService.findByExam(examId);
    }

    @UseGuards(AdminGuard)
    @Post()
    create(
        @Param('examId') examId: string,
        @Body() createQuestionDto: CreateQuestionDto,
    ) {
        return this.questionsService.create(examId, createQuestionDto);
    }
}
