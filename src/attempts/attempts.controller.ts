import {
    Body,
    Controller,
    Get,
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
