import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('exams/:examId/questions')
export class ExamQuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Get()
    findByExam(
        @Param('examId') examId: string,
        @Request() request: { user: { sub: string; role: UserRole } },
    ) {
        return this.questionsService.findByExam(
            examId,
            request.user.role === UserRole.ADMIN,
            request.user.role === UserRole.STUDENT ? request.user.sub : undefined,
        );
    }

    @Roles(UserRole.ADMIN)
    @Post()
    create(
        @Param('examId') examId: string,
        @Body() createQuestionDto: CreateQuestionDto,
    ) {
        return this.questionsService.create(examId, createQuestionDto);
    }
}
