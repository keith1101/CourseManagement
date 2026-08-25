import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialQueryDto } from './dto/material-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
    constructor(private readonly materialsService: MaterialsService) {}

    @UseGuards(AdminGuard)
    @Post()
    create(@Body() createMaterialDto: CreateMaterialDto) {
        return this.materialsService.create(createMaterialDto);
    }

    @Get()
    findAll(@Query() query: MaterialQueryDto, @Request() request: { user: { sub: string; role: string } }) {
        return this.materialsService.findAll(query, request.user);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() request: { user: { sub: string; role: string } }) {
        return this.materialsService.findOne(id, request.user);
    }

    @UseGuards(AdminGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateMaterialDto: UpdateMaterialDto,
    ) {
        return this.materialsService.update(id, updateMaterialDto);
    }

    @UseGuards(AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.materialsService.remove(id);
    }
}
