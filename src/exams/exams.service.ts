import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ExamStatus } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';

@Injectable()
export class ExamsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(createExamDto: CreateExamDto) {
        return this.prisma.exam.create({
            data: {
                title: createExamDto.title,
                description: createExamDto.description,
                accessLevel: createExamDto.accessLevel ?? 'FREE',
                status: ExamStatus.DRAFT,
            },
        });
    }

    async findAll(query: ExamQueryDto, userRole?: string) {
        const where: Record<string, unknown> = {};

        if (query.status) {
            where.status = query.status;
        } else if (userRole === 'STUDENT') {
            // Students can only see published exams
            where.status = ExamStatus.PUBLISHED;
        }

        return this.prisma.exam.findMany({
            where,
            include: {
                _count: {
                    select: {
                        questions: {
                            where: { deletedAt: null },
                        },
                    },
                },
            },
            orderBy: [
                { displayOrder: 'asc' },
                { createdAt: 'desc' },
            ],
        });
    }

    async findOne(id: string) {
        const exam = await this.prisma.exam.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        questions: {
                            where: { deletedAt: null },
                        },
                        examAttempts: true,
                    },
                },
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return exam;
    }

    async update(id: string, updateExamDto: UpdateExamDto) {
        await this.findOne(id);

        return this.prisma.exam.update({
            where: { id },
            data: updateExamDto,
        });
    }

    async remove(id: string) {
        const exam = await this.findOne(id);

        if (exam.status !== ExamStatus.DRAFT) {
            throw new ConflictException(
                'Only DRAFT exams can be deleted',
            );
        }

        if (exam._count.examAttempts > 0) {
            throw new ConflictException(
                'Cannot delete exam that has attempts',
            );
        }

        return this.prisma.exam.delete({
            where: { id },
        });
    }

    async publish(id: string) {
        const exam = await this.findOne(id);

        if (exam.status === ExamStatus.PUBLISHED) {
            return exam;
        }

        if (exam.status !== ExamStatus.DRAFT) {
            throw new ConflictException(
                'Only DRAFT exams can be published',
            );
        }

        return this.prisma.exam.update({
            where: { id },
            data: {
                status: ExamStatus.PUBLISHED,
                publishedAt: new Date(),
            },
        });
    }

    async unpublish(id: string) {
        const exam = await this.findOne(id);

        if (exam.status === ExamStatus.DRAFT) {
            return exam;
        }

        if (exam.status !== ExamStatus.PUBLISHED) {
            throw new ConflictException(
                'Only PUBLISHED exams can be unpublished',
            );
        }

        if (exam._count.examAttempts > 0) {
            throw new ConflictException(
                'Cannot unpublish exam that has attempts',
            );
        }

        return this.prisma.exam.update({
            where: { id },
            data: {
                status: ExamStatus.DRAFT,
                publishedAt: null,
            },
        });
    }
}
