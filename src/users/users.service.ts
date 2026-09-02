import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUsersDto } from './dto/update-users.dto';

const safeUserSelect = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    dateOfBirth: true,
    role: true,
    isActive: true,
    accessLevel: true,
    proExpiresAt: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

@Injectable()
export class UsersService {
    constructor(private readonly prismaService: PrismaService) {}

    async findAll(search?: string) {
        const where = search
            ? {
                  OR: [
                      { fullName: { contains: search, mode: 'insensitive' as const } },
                      { email: { contains: search, mode: 'insensitive' as const } },
                      { phone: { contains: search, mode: 'insensitive' as const } },
                  ],
              }
            : {};

        return this.prismaService.user.findMany({
            where,
            select: safeUserSelect,
            orderBy: { createdAt: 'desc' },
        });
    }

    async find(id: string) {
        const user = await this.prismaService.user.findUnique({
            where: { id },
            select: safeUserSelect,
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async findByEmail(email: string) {
        return this.prismaService.user.findUnique({
            where: { email },
            select: safeUserSelect,
        });
    }

    async update(id: string, updateUsersDto: UpdateUsersDto, actorId?: string) {
        if (id === actorId && updateUsersDto.isActive === false) {
            throw new ForbiddenException('Cannot lock your own account');
        }

        if (
            id === actorId &&
            (updateUsersDto.role !== undefined ||
                updateUsersDto.accessLevel !== undefined ||
                updateUsersDto.proExpiresAt !== undefined)
        ) {
            throw new ForbiddenException('Cannot change your own permissions');
        }

        await this.find(id);

        const { dateOfBirth, proExpiresAt, isActive, ...rest } = updateUsersDto;

        return this.prismaService.user.update({
            where: { id },
            data: {
                ...rest,
                ...(isActive === undefined ? {} : { isActive }),
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                proExpiresAt: proExpiresAt === undefined ? undefined : proExpiresAt ? new Date(proExpiresAt) : null,
            },
            select: safeUserSelect,
        });
    }

    async lock(id: string, actorId?: string) {
        if (id === actorId) {
            throw new ForbiddenException('Cannot lock your own account');
        }

        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { isActive: false },
            select: safeUserSelect,
        });
    }

    async unlock(id: string) {
        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { isActive: true },
            select: safeUserSelect,
        });
    }

    async updatePro(id: string, actorId?: string) {
        if (id === actorId) {
            throw new ForbiddenException('Cannot change your own permissions');
        }

        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { accessLevel: 'PRO' },
            select: safeUserSelect,
        });
    }

    async updateFree(id: string, actorId?: string) {
        if (id === actorId) {
            throw new ForbiddenException('Cannot change your own permissions');
        }

        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { accessLevel: 'FREE', proExpiresAt: null },
            select: safeUserSelect,
        });
    }

    async resetPassword(id: string, resetPasswordDto: ResetUserPasswordDto) {
        const user = await this.prismaService.user.findUnique({
            where: { id },
            select: { role: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.role !== UserRole.STUDENT) {
            throw new ForbiddenException('Only student accounts can be reset');
        }

        const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);

        await this.prismaService.user.update({
            where: { id },
            data: {
                passwordHash,
                tokenVersion: { increment: 1 },
            },
        });

        return { message: 'Password reset successfully' };
    }
}
