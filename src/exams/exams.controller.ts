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
import { UserRole } from '../../generated/client/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamsService } from './exams.service';

type AuthenticatedRequest = {
  user: {
    sub: string;
    role: UserRole;
  };
};

type Viewer = AuthenticatedRequest['user'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createExamDto: CreateExamDto) {
    return this.examsService.create(createExamDto);
  }

  @Get()
  findAll(
    @Query() query: ExamQueryDto,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.examsService.findAll(query, this.viewer(request.user));
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.examsService.findOne(id, this.viewer(request.user));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateExamDto: UpdateExamDto,
  ) {
    return this.examsService.update(id, updateExamDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.examsService.remove(id);
  }

  @Patch(':id/publish')
  @Roles(UserRole.ADMIN)
  publish(@Param('id') id: string) {
    return this.examsService.publish(id);
  }

  @Patch(':id/unpublish')
  @Roles(UserRole.ADMIN)
  unpublish(@Param('id') id: string) {
    return this.examsService.unpublish(id);
  }

  private viewer(user: Viewer) {
    return { userId: user.sub, role: user.role };
  }
}
