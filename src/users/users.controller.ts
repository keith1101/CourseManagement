import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUsersDto } from './dto/update-users.dto';

@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService
    ) {

    }

    @Get()
    findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    find(
        @Param('id') id: string) {
        return this.usersService.find(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string, 
        @Body('updateUsersDto') updateUsersDto: UpdateUsersDto) {
        return this.usersService.update(id, updateUsersDto);
    }

    @Patch(':id/lock')
    lock(
        @Param('id') id: string) {
        return this.usersService.lock(id);
    }

    @Patch(':id/unlock')
    unlock(
        @Param('id') id: string) {
        return this.usersService.unlock(id);
    }

    @Patch(':id/pro')
    updatePro(
        @Param('id') id: string) {
        return this.usersService.updatePro(id);
    }

    @Patch(':id/free')
    updateFree(
        @Param('id') id: string) {
        return this.usersService.updateFree(id);
    }

}
