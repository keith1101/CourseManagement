import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUsersDto } from './dto/update-users.dto';

@Injectable()
export class UsersService {
    constructor(
        private readonly prismaService: PrismaService
    ) {

    }

    async findAll() {
        const users = await this.prismaService.user.findMany();
        return users;
    }

    async find(id: string) {
        const user = await this.prismaService.user.findUnique({where: {id: id}});
        return user;
    }

    async findByEmail(email: string) {
        const user = await this.prismaService.user.findUnique({
            where: {email: email}
        })
        return user;
    }

    async update(id: string, updateUsersDto: UpdateUsersDto) {
        return this.prismaService.user.update({
            where: {id: id},
            data: updateUsersDto,
        });
    }


    async lock(id: string) {
        const lockStatus = await this.prismaService.user.update({
            where: {id: id},
            data: {isActive: false},
        })
        return lockStatus;
    }

    async unlock(id: string) {
        const unlockStatus = await this.prismaService.user.update({
            where: {id: id},
            data: {isActive: true}
        })
        return unlockStatus;
    }

    async updatePro(id: string) {
        const updateProStatus = await this.prismaService.user.update({
            where: {id: id},
            data: {accessLevel: 'PRO'}
        });

        return updateProStatus;
    }

    async updateFree(id: string) {
        const updateFreeStatus = await this.prismaService.user.update({
            where: {id: id},
            data: {accessLevel: 'FREE'}
        })
        return updateFreeStatus;
    }
}
