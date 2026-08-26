import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentStatus } from './dto/assignment-status.enum';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

const assignmentInclude = {
    user: {
        select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
        },
    },
    exam: {
        select: {
            id: true,
            title: true,
            status: true,
            accessLevel: true,
        },
    },
        examAttempts: {
            select: {
                id: true,
                status: true,
                startedAt: true,
                submittedAt: true,
                correctCount: true,
                totalQuestions: true,
        },
        orderBy: {
            startedAt: 'desc' as const,
        },
    },
} as const;

@Injectable()
export class AssignmentsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(createAssignmentDto: CreateAssignmentDto) {
        const [user, exam] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: createAssignmentDto.userId },
                select: { id: true },
            }),
            this.prisma.exam.findUnique({
                where: { id: createAssignmentDto.examId, deletedAt: null },
                select: { id: true },
            }),
        ]);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        const dueAt = new Date(createAssignmentDto.dueAt);
        if (dueAt.getTime() <= Date.now()) {
            throw new BadRequestException('Due date must be in the future');
        }

        const existing = await this.prisma.examAssignment.findFirst({
            where: {
                userId: createAssignmentDto.userId,
                examId: createAssignmentDto.examId,
            },
            select: { id: true },
        });
        if (existing) throw new ConflictException('Assignment already exists for this student and exam');

        const assignment = await this.prisma.examAssignment.create({
            data: {
                userId: createAssignmentDto.userId,
                examId: createAssignmentDto.examId,
                dueAt,
            },
            include: assignmentInclude,
        });

        return this.withStatus(assignment);
    }

    async findAll(query: AssignmentQueryDto, userId?: string) {
        const assignments = await this.prisma.examAssignment.findMany({
            where: {
                userId: userId ?? query.userId,
                exam: { is: { deletedAt: null } },
            },
            include: assignmentInclude,
            orderBy: {
                dueAt: 'asc',
            },
        });

        const assignmentsWithStatus = assignments.map((assignment) =>
            this.withStatus(assignment),
        );

        if (!query.status) {
            return assignmentsWithStatus;
        }

        return assignmentsWithStatus.filter(
            (assignment) => assignment.status === query.status,
        );
    }

    async findOne(id: string, userId?: string) {
        const assignment = await this.prisma.examAssignment.findUnique({
            where: {
                id,
                exam: { is: { deletedAt: null } },
            },
            include: assignmentInclude,
        });

        if (!assignment || (userId && assignment.userId !== userId)) {
            throw new NotFoundException('Assignment not found');
        }

        return this.withStatus(assignment);
    }

    async update(id: string, updateAssignmentDto: UpdateAssignmentDto) {
        await this.findOne(id);

        const dueAt = new Date(updateAssignmentDto.dueAt);
        if (dueAt.getTime() <= Date.now()) {
            throw new BadRequestException('Due date must be in the future');
        }

        await this.prisma.examAssignment.update({
            where: { id },
            data: {
                dueAt,
            },
        });

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);

        return this.prisma.examAssignment.delete({
            where: { id },
        });
    }

    private withStatus<
        T extends {
            dueAt: Date;
            examAttempts: Array<{ status: AttemptStatus; id: string; correctCount: number | null; totalQuestions: number }>;
        },
    >(assignment: T) {
        const hasCompletedAttempt = assignment.examAttempts.some(
            (attempt) => attempt.status === AttemptStatus.COMPLETED,
        );
        const hasInProgressAttempt = assignment.examAttempts.some(
            (attempt) => attempt.status === AttemptStatus.IN_PROGRESS,
        );

        let status = AssignmentStatus.PENDING;

        if (hasCompletedAttempt) {
            status = AssignmentStatus.COMPLETED;
        } else if (assignment.dueAt.getTime() < Date.now()) {
            status = AssignmentStatus.OVERDUE;
        } else if (hasInProgressAttempt) {
            status = AssignmentStatus.IN_PROGRESS;
        }

        return {
            ...assignment,
            status,
        };
    }
}
