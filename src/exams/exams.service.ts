import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessLevel, ExamStatus } from '../../generated/client/enums';
import { Prisma, UserRole } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

const examInclude = {
  _count: {
    select: {
      questions: {
        where: { deletedAt: null },
      },
      examAssignments: true,
      examAttempts: true,
    },
  },
} as const;

type Viewer = {
  userId: string;
  role: UserRole;
};

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createExamDto: CreateExamDto) {
    return this.prisma.exam.create({
      data: {
        title: createExamDto.title.trim(),
        description: createExamDto.description,
        accessLevel: createExamDto.accessLevel ?? AccessLevel.FREE,
        displayOrder: createExamDto.displayOrder ?? 0,
        status: ExamStatus.DRAFT,
        publishedAt: null,
      },
      include: examInclude,
    });
  }

  async findAll(query: ExamQueryDto, viewer: Viewer) {
    const where: Prisma.ExamWhereInput = { deletedAt: null };

    if (viewer.role === UserRole.ADMIN) {
      if (query.status) {
        where.status = query.status;
      }
    } else {
      const access = await this.getStudentAccess(viewer.userId);
      where.status = ExamStatus.PUBLISHED;
      if (!access.isPro) {
        where.accessLevel = AccessLevel.FREE;
      }
    }

    return this.prisma.exam.findMany({
      where,
      include: examInclude,
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string, viewer: Viewer) {
    const where: Prisma.ExamWhereInput = { id, deletedAt: null };

    if (viewer.role === UserRole.STUDENT) {
      const access = await this.getStudentAccess(viewer.userId);
      where.status = ExamStatus.PUBLISHED;
      if (!access.isPro) {
        where.accessLevel = AccessLevel.FREE;
      }
    }

    const exam = await this.prisma.exam.findFirst({
      where,
      include: examInclude,
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return exam;
  }

  async update(id: string, updateExamDto: UpdateExamDto) {
    const existing = await this.getExamForAdmin(id);
    const data: Prisma.ExamUncheckedUpdateInput = {};

    if (updateExamDto.title !== undefined) {
      data.title = updateExamDto.title.trim();
    }
    if (updateExamDto.description !== undefined) {
      data.description = updateExamDto.description;
    }
    if (updateExamDto.accessLevel !== undefined) {
      data.accessLevel = updateExamDto.accessLevel;
    }
    if (updateExamDto.displayOrder !== undefined) {
      data.displayOrder = updateExamDto.displayOrder;
    }
    return this.prisma.exam.update({
      where: { id },
      data,
      include: examInclude,
    });
  }

  async publish(id: string) {
    const exam = await this.getExamForAdmin(id);

    if (exam.status !== ExamStatus.DRAFT) {
      throw new ConflictException('Only DRAFT exams can be published');
    }

    return this.prisma.exam.update({
      where: { id },
      data: {
        status: ExamStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: examInclude,
    });
  }

  async unpublish(id: string) {
    const exam = await this.getExamForAdmin(id);

    if (exam.status !== ExamStatus.PUBLISHED) {
      throw new ConflictException('Only PUBLISHED exams can be unpublished');
    }

    return this.prisma.exam.update({
      where: { id },
      data: {
        status: ExamStatus.DRAFT,
        publishedAt: null,
      },
      include: examInclude,
    });
  }

  async remove(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    if (exam.deletedAt) {
      throw new NotFoundException('Exam not found');
    }

    return this.prisma.exam.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: ExamStatus.ARCHIVED,
        publishedAt: null,
      },
      include: examInclude,
    });
  }

  private async getExamForAdmin(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return exam;
  }

  private async getStudentAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accessLevel: true,
        proExpiresAt: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('User cannot access exams');
    }

    return {
      isPro:
        user.accessLevel === AccessLevel.PRO &&
        (!user.proExpiresAt || user.proExpiresAt.getTime() > Date.now()),
    };
  }

}
