import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '../../generated/client/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialQueryDto } from './dto/material-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { UploadMaterialDto } from './dto/upload-material.dto';
import { MaterialsService } from './materials.service';
import { StorageUploadFile } from '../storage/gcs-storage.service';

type AuthenticatedRequest = {
  user: { sub: string; role: UserRole };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: StorageUploadFile | undefined,
    @Body() dto: UploadMaterialDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.materialsService.upload(file, dto);
  }

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

  @Get(':id/download')
  download(
    @Param('id') id: string,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.materialsService.getDownloadUrl(id, this.viewer(request));
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
