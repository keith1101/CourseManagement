import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

    async update(id: string, updateUsersDto: UpdateUsersDto) {
        await this.find(id);

        const { dateOfBirth, proExpiresAt, ...rest } = updateUsersDto;

        return this.prismaService.user.update({
            where: { id },
            data: {
                ...rest,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                proExpiresAt: proExpiresAt === undefined ? undefined : proExpiresAt ? new Date(proExpiresAt) : null,
            },
            select: safeUserSelect,
        });
    }

    async lock(id: string) {
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

    async updatePro(id: string) {
        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { accessLevel: 'PRO' },
            select: safeUserSelect,
        });
    }

    async updateFree(id: string) {
        await this.find(id);

        return this.prismaService.user.update({
            where: { id },
            data: { accessLevel: 'FREE', proExpiresAt: null },
            select: safeUserSelect,
        });
    }
}
