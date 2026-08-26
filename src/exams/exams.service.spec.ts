import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccessLevel, ExamStatus } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { ExamsService } from './exams.service';

describe('ExamsService', () => {
  const activeSubject = { id: 'subject-1', isActive: true };
  const exam = {
    id: 'exam-1',
    subjectId: 'subject-1',
    title: 'Mock exam',
    description: null,
    status: ExamStatus.DRAFT,
    accessLevel: AccessLevel.FREE,
    displayOrder: 0,
    publishedAt: null,
    subject: {
      id: 'subject-1',
      code: 'MATH',
      name: 'Math',
      description: null,
      displayOrder: 1,
      isActive: true,
    },
    _count: { questions: 0, examAssignments: 0, examAttempts: 0 },
  };

  let service: ExamsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      subject: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      exam: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ExamsService(prisma as PrismaService);
  });

  it('creates a DRAFT exam for an active subject and ignores protected fields', async () => {
    prisma.subject.findUnique.mockResolvedValue(activeSubject);
    prisma.exam.create.mockResolvedValue(exam);

    await expect(
      service.create({
        subjectId: 'subject-1',
        title: '  Mock exam  ',
        accessLevel: AccessLevel.PRO,
        status: ExamStatus.PUBLISHED,
        publishedAt: new Date(),
      } as any),
    ).resolves.toBe(exam);

    expect(prisma.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          subjectId: 'subject-1',
          title: 'Mock exam',
          description: undefined,
          accessLevel: AccessLevel.PRO,
          displayOrder: 0,
          status: ExamStatus.DRAFT,
          publishedAt: null,
        },
      }),
    );
  });

  it.each([null, { id: 'subject-1', isActive: false }])(
    'rejects creation when Subject is missing or inactive',
    async (subject) => {
      prisma.subject.findUnique.mockResolvedValue(subject);

      await expect(
        service.create({ subjectId: 'subject-1', title: 'Exam' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.exam.create).not.toHaveBeenCalled();
    },
  );

  it('lists every requested status for Admin in stable order', async () => {
    prisma.exam.findMany.mockResolvedValue([exam]);

    await expect(
      service.findAll(
        { status: ExamStatus.ARCHIVED } as ExamQueryDto,
        { userId: 'admin-1', role: 'ADMIN' } as any,
      ),
    ).resolves.toEqual([exam]);

    expect(prisma.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: ExamStatus.ARCHIVED },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('limits a Free Student list to published FREE exams', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.exam.findMany.mockResolvedValue([exam]);

    await service.findAll(
      { status: ExamStatus.DRAFT },
      { userId: 'student-1', role: 'STUDENT' } as any,
    );

    expect(prisma.exam.findMany.mock.calls[0][0].where).toEqual({
      status: ExamStatus.PUBLISHED,
      accessLevel: AccessLevel.FREE,
    });
  });

  it('allows an active PRO Student to list all published access levels', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.PRO,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.exam.findMany.mockResolvedValue([]);

    await service.findAll({}, { userId: 'student-1', role: 'STUDENT' } as any);

    expect(prisma.exam.findMany.mock.calls[0][0].where).toEqual({
      status: ExamStatus.PUBLISHED,
    });
  });

  it('returns 404 when a Student requests an unpublished or inaccessible exam', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.exam.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('exam-1', { userId: 'student-1', role: 'STUDENT' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exam.findFirst.mock.calls[0][0].where).toEqual({
      id: 'exam-1',
      status: ExamStatus.PUBLISHED,
      accessLevel: AccessLevel.FREE,
    });
  });

  it('does not include Questions or answer data in the exam response query', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.exam.findFirst.mockResolvedValue(exam);

    await service.findOne('exam-1', { userId: 'student-1', role: 'STUDENT' } as any);

    const include = prisma.exam.findFirst.mock.calls[0][0].include;
    expect(include).not.toHaveProperty('questions');
    expect(include.subject.select).not.toHaveProperty('passwordHash');
  });

  it('updates allowed fields and validates a changed active Subject', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      subjectId: 'subject-1',
      status: ExamStatus.DRAFT,
    });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-2', isActive: true });
    prisma.exam.update.mockResolvedValue(exam);

    await service.update('exam-1', {
      subjectId: 'subject-2',
      title: 'Updated',
      status: ExamStatus.PUBLISHED,
      publishedAt: new Date(),
    } as any);

    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          subjectId: 'subject-2',
          title: 'Updated',
        },
      }),
    );
  });

  it('rejects changing to a missing or inactive Subject', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', subjectId: 'subject-1', status: ExamStatus.DRAFT,
    });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-2', isActive: false });

    await expect(
      service.update('exam-1', { subjectId: 'subject-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exam.update).not.toHaveBeenCalled();
  });

  it('returns 404 when updating a missing Exam', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { title: 'Updated' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishes only DRAFT exams and sets publishedAt server-side', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', subjectId: 'subject-1', status: ExamStatus.DRAFT,
    });
    prisma.exam.update.mockResolvedValue({ ...exam, status: ExamStatus.PUBLISHED });

    await service.publish('exam-1');

    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ExamStatus.PUBLISHED, publishedAt: expect.any(Date) },
      }),
    );
  });

  it.each([ExamStatus.PUBLISHED, ExamStatus.ARCHIVED])(
    'rejects publishing an %s exam',
    async (status) => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1', subjectId: 'subject-1', status,
      });

      await expect(service.publish('exam-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it('unpublishes only PUBLISHED exams and clears publishedAt', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', subjectId: 'subject-1', status: ExamStatus.PUBLISHED,
    });
    prisma.exam.update.mockResolvedValue(exam);

    await service.unpublish('exam-1');

    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ExamStatus.DRAFT, publishedAt: null },
      }),
    );
  });

  it.each([ExamStatus.DRAFT, ExamStatus.ARCHIVED])(
    'rejects unpublishing an %s exam',
    async (status) => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1', subjectId: 'subject-1', status,
      });

      await expect(service.unpublish('exam-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it('rejects deletion when Questions, Assignments or Attempts exist', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      _count: { questions: 1, examAssignments: 0, examAttempts: 0 },
    });

    await expect(service.remove('exam-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.exam.delete).not.toHaveBeenCalled();
  });

  it('deletes an Exam only when it has no related data', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      _count: { questions: 0, examAssignments: 0, examAttempts: 0 },
    });
    prisma.exam.delete.mockResolvedValue({ id: 'exam-1' });

    await expect(service.remove('exam-1')).resolves.toEqual({ id: 'exam-1' });
    expect(prisma.exam.delete).toHaveBeenCalledWith({ where: { id: 'exam-1' } });
  });
});
