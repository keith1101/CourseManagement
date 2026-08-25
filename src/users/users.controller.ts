import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { UsersService } from './users.service';
import { UpdateUsersDto } from './dto/update-users.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    findAll(@Query('search') search?: string) {
        return this.usersService.findAll(search);
    }

    @Get(':id')
    find(@Param('id') id: string) {
        return this.usersService.find(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateUsersDto: UpdateUsersDto,
    ) {
        return this.usersService.update(id, updateUsersDto);
    }

    @Patch(':id/lock')
    lock(@Param('id') id: string) {
        return this.usersService.lock(id);
    }

    @Patch(':id/unlock')
    unlock(@Param('id') id: string) {
        return this.usersService.unlock(id);
    }

    @Patch(':id/pro')
    updatePro(@Param('id') id: string) {
        return this.usersService.updatePro(id);
    }

    @Patch(':id/free')
    updateFree(@Param('id') id: string) {
        return this.usersService.updateFree(id);
    }
}
