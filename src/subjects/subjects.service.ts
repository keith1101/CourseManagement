import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Prisma } from '../../generated/client/client';

@Injectable()
export class SubjectsService {
    constructor (private readonly prisma: PrismaService) {}

    async create(createSubjectDto: CreateSubjectDto) {
        await this.ensureCodeIsAvailable(createSubjectDto.code);

        try {
            return await this.prisma.subject.create ({
                data: createSubjectDto,
            });
        } catch (error) {
            this.handleUniqueCodeError(error);
        }
    }   

    async findAll() {
        return this.prisma.subject.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                displayOrder: 'asc',
            },
        });
    }

    async findOne(id: string) {
        const subject = await this.prisma.subject.findUnique({
            where: {
                id: id,
            }
        });
        if (!subject || !subject.isActive) {
            throw new NotFoundException('Subject not found!');
        }

        return subject;
    }

    async update(id: string, updateSubjectDto: UpdateSubjectDto) {
        await this.findActiveOrThrow(id);

        if (updateSubjectDto.code) {
            await this.ensureCodeIsAvailable(updateSubjectDto.code, id);
        }

        try {
            return await this.prisma.subject.update ({
                where: { id },
                data: updateSubjectDto,
            });
        } catch (error) {
            this.handleUniqueCodeError(error);
        }
    }

    async remove(id: string) {
        await this.findActiveOrThrow(id);

        return this.prisma.subject.update ({
            where: { id },
            data: {
                isActive: false,
            }
        });
    }

    private async findActiveOrThrow(id: string) {
        const subject = await this.prisma.subject.findFirst({
            where: {
                id,
                isActive: true,
            },
        });

        if (!subject) {
            throw new NotFoundException('Subject not found!');
        }

        return subject;
    }

    private async ensureCodeIsAvailable(code: string, excludeId?: string) {
        const existingSubject = await this.prisma.subject.findFirst({
            where: {
                code,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        });

        if (existingSubject) {
            throw new ConflictException('Subject code already exists');
        }
    }

    private handleUniqueCodeError(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            throw new ConflictException('Subject code already exists');
        }

        throw error;
    }
}
