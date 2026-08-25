import {
    Body,
    Controller,
    Param,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { AttemptsService } from './attempts.service';
import { StartAttemptDto } from './dto/start-attempt.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
    };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('exams/:examId/attempts')
export class ExamAttemptsController {
    constructor(private readonly attemptsService: AttemptsService) {}

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
