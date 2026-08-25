import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';

@Controller('exams/:examId/questions')
export class ExamQuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Get()
    findByExam(@Param('examId') examId: string) {
        return this.questionsService.findByExam(examId);
    }

    @Post()
    create(
        @Param('examId') examId: string,
        @Body() createQuestionDto: CreateQuestionDto,
    ) {
        return this.questionsService.create(examId, createQuestionDto);
    }
}
