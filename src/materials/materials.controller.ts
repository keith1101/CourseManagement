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
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialQueryDto } from './dto/material-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsService } from './materials.service';

type AuthenticatedRequest = {
  user: { sub: string; role: UserRole };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Get()
  findAll(
    @Query() query: MaterialQueryDto,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.materialsService.findAll(query, this.viewer(request));
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.materialsService.findOne(id, this.viewer(request));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.materialsService.remove(id);
  }

  @Patch(':id/publish')
  @Roles(UserRole.ADMIN)
  publish(@Param('id') id: string) {
    return this.materialsService.publish(id);
  }

  @Patch(':id/unpublish')
  @Roles(UserRole.ADMIN)
  unpublish(@Param('id') id: string) {
    return this.materialsService.unpublish(id);
  }

  private viewer(request: AuthenticatedRequest) {
    return { userId: request.user.sub, role: request.user.role };
  }
}
