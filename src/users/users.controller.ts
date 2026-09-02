import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { UsersService } from './users.service';
import { UpdateUsersDto } from './dto/update-users.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';

type AuthenticatedRequest = {
    user: {
        sub: string;
    };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
        @Request() request: AuthenticatedRequest,
    ) {
        return this.usersService.update(id, updateUsersDto, request.user.sub);
    }

    @Patch(':id/lock')
    lock(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.usersService.lock(id, request.user.sub);
    }

    @Patch(':id/unlock')
    unlock(@Param('id') id: string) {
        return this.usersService.unlock(id);
    }

    @Patch(':id/pro')
    updatePro(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.usersService.updatePro(id, request.user.sub);
    }

    @Patch(':id/free')
    updateFree(
        @Param('id') id: string,
        @Request() request: AuthenticatedRequest,
    ) {
        return this.usersService.updateFree(id, request.user.sub);
    }

    @Patch(':id/reset-password')
    resetPassword(
        @Param('id') id: string,
        @Body() resetPasswordDto: ResetUserPasswordDto,
    ) {
        return this.usersService.resetPassword(id, resetPasswordDto);
    }
}
