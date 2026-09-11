import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { AttemptsService } from './attempts.service';
import { AttemptQueryDto } from './dto/attempt-query.dto';
import { SaveAttemptAnswerDto } from './dto/save-attempt-answer.dto';
import { SequentialAnswerDto } from './dto/sequential-answer.dto';
import { SequentialContinueDto } from './dto/sequential-continue.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
        role: string;
    };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('attempts')
export class AttemptsController {
    constructor(private readonly attemptsService: AttemptsService) {}

    @Get()
    findAll(
        @Query() query: AttemptQueryDto,
        @Request() request: AuthenticatedRequest,
    ) {
        const userId = request.user.role === 'STUDENT'
            ? request.user.sub
            : undefined;
        return this.attemptsService.findAll(query, userId);
    }

    @Get(':id')
    findOne(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        const userId = request.user.role === 'STUDENT'
            ? request.user.sub
            : undefined;
        return this.attemptsService.findOne(id, userId);
    }

    @Roles(UserRole.STUDENT)
    @Get(':id/session')
    session(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.attemptsService.getSequentialSession(id, request.user.sub);
    }

    @Roles(UserRole.STUDENT)
    @Post(':id/current-question/submit')
    submitSequentialAnswer(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: SequentialAnswerDto,
    ) {
        return this.attemptsService.submitSequentialAnswer(
            id,
            request.user.sub,
            dto,
            idempotencyKey ?? '',
            new Date(),
        );
    }

    @Roles(UserRole.STUDENT)
    @Post(':id/current-question/expire')
    expireSequentialQuestion(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.attemptsService.expireSequentialQuestion(id, request.user.sub);
    }

    @Roles(UserRole.STUDENT)
    @Post(':id/current-question/continue')
    continueSequentialQuestion(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: SequentialContinueDto,
    ) {
        return this.attemptsService.continueSequentialQuestion(
            id,
            request.user.sub,
            dto,
            idempotencyKey ?? '',
            new Date(),
        );
    }

    @Roles(UserRole.STUDENT)
    @Post(':id/answers')
    saveAnswer(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
        @Body() saveAttemptAnswerDto: SaveAttemptAnswerDto,
    ) {
        return this.attemptsService.saveAnswer(
            id,
            request.user.sub,
            saveAttemptAnswerDto,
        );
    }

    @Roles(UserRole.STUDENT)
    @Post(':id/submit')
    submit(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.attemptsService.submit(id, request.user.sub);
    }

    @Get(':id/result')
    result(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        const userId = request.user.role === 'STUDENT'
            ? request.user.sub
            : undefined;
        return this.attemptsService.getResult(id, userId);
    }
}
