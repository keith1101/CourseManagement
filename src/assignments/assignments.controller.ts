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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { AssignmentsService } from './assignments.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
        role: string;
    };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('assignments')
export class AssignmentsController {
    constructor(private readonly assignmentsService: AssignmentsService) {}

    @Roles(UserRole.ADMIN)
    @Post()
    create(@Body() createAssignmentDto: CreateAssignmentDto) {
        return this.assignmentsService.create(createAssignmentDto);
    }

    @Get()
    findAll(
        @Query() query: AssignmentQueryDto,
        @Request() request: AuthenticatedRequest,
    ) {
        const userId = request.user.role === 'STUDENT'
            ? request.user.sub
            : undefined;
        return this.assignmentsService.findAll(query, userId);
    }

    @Get(':id')
    findOne(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        const userId = request.user.role === 'STUDENT'
            ? request.user.sub
            : undefined;
        return this.assignmentsService.findOne(id, userId);
    }

    @Roles(UserRole.ADMIN)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateAssignmentDto: UpdateAssignmentDto,
    ) {
        return this.assignmentsService.update(id, updateAssignmentDto);
    }

    @Roles(UserRole.ADMIN)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.assignmentsService.remove(id);
    }
}
