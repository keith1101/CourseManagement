import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialQueryDto } from './dto/material-query.dto';

@Injectable()
export class MaterialsService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createMaterialDto: CreateMaterialDto) {
        const subject = await this.prisma.subject.findUnique({
            where: { id: createMaterialDto.subjectId },
            select: { id: true },
        });

        if (!subject) {
            throw new NotFoundException('Subject not found');
        }

        return this.prisma.material.create({
            data: {
                ...createMaterialDto,
                isPublished: true,
                publishedAt: new Date(),
            },
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    }

    async findAll(query: MaterialQueryDto, user?: { sub: string; role: string }) {
        const where: Record<string, unknown> = {};

        if (query.subjectId) {
            where.subjectId = query.subjectId;
        }

        if (query.materialType) {
            where.materialType = query.materialType;
        }

        if (query.accessLevel) {
            where.accessLevel = query.accessLevel;
        }

        if (user?.role !== 'ADMIN') {
            const account = await this.prisma.user.findUnique({
                where: { id: user?.sub },
                select: { accessLevel: true, proExpiresAt: true },
            });
            const isPro = account?.accessLevel === 'PRO' && (!account.proExpiresAt || account.proExpiresAt.getTime() > Date.now());
            where.isPublished = true;
            if (!isPro) where.accessLevel = 'FREE';
        }

        return this.prisma.material.findMany({
            where,
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string, user?: { sub: string; role: string }) {
        const material = await this.prisma.material.findUnique({
            where: { id },
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        if (!material) {
            throw new NotFoundException('Material not found');
        }

        if (user?.role !== 'ADMIN') {
            const account = await this.prisma.user.findUnique({
                where: { id: user?.sub },
                select: { accessLevel: true, proExpiresAt: true },
            });
            const isPro = account?.accessLevel === 'PRO' && (!account.proExpiresAt || account.proExpiresAt.getTime() > Date.now());
            if (!material.isPublished || (material.accessLevel === 'PRO' && !isPro)) {
                throw new ForbiddenException('Material is not available for this account');
            }
        }

        return material;
    }

    async update(id: string, updateMaterialDto: UpdateMaterialDto) {
        const existing = await this.prisma.material.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new NotFoundException('Material not found');

        if (updateMaterialDto.subjectId) {
            const subject = await this.prisma.subject.findUnique({
                where: { id: updateMaterialDto.subjectId },
                select: { id: true },
            });

            if (!subject) {
                throw new NotFoundException('Subject not found');
            }
        }

        return this.prisma.material.update({
            where: { id },
            data: updateMaterialDto,
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    }

    async remove(id: string) {
        const existing = await this.prisma.material.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new NotFoundException('Material not found');

        return this.prisma.material.delete({
            where: { id },
        });
    }
}
