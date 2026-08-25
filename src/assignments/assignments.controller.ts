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
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentsController {
    constructor(private readonly assignmentsService: AssignmentsService) {}

    @UseGuards(AdminGuard)
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

    @UseGuards(AdminGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateAssignmentDto: UpdateAssignmentDto,
    ) {
        return this.assignmentsService.update(id, updateAssignmentDto);
    }

    @UseGuards(AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.assignmentsService.remove(id);
    }
}
