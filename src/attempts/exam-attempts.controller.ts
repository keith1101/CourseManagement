import {
    Body,
    Controller,
    Param,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { StudentGuard } from '../auth/student.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttemptsService } from './attempts.service';
import { StartAttemptDto } from './dto/start-attempt.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
    };
};

@UseGuards(JwtAuthGuard)
@Controller('exams/:examId/attempts')
export class ExamAttemptsController {
    constructor(private readonly attemptsService: AttemptsService) {}

    @UseGuards(StudentGuard)
    @Post()
    start(
        @Param('examId') examId: string,
        @Request() request: AuthenticatedRequest,
        @Body() startAttemptDto: StartAttemptDto,
    ) {
        return this.attemptsService.start(
            examId,
            request.user.sub,
            startAttemptDto,
        );
    }
}
