import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AttemptStatus } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentStatus } from './dto/assignment-status.enum';
import { AssignmentsService } from './assignments.service';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let prisma: any;
  const dueAt = new Date(Date.now() + 60 * 60 * 1000);
  const assignment = {
    id: 'assignment-1',
    userId: 'student-1',
    examId: 'exam-1',
    dueAt,
    user: { id: 'student-1', fullName: 'Student', email: 's@example.com', role: 'STUDENT' },
    exam: { id: 'exam-1', title: 'Exam', status: 'PUBLISHED', accessLevel: 'FREE' },
    examAttempts: [],
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      exam: { findUnique: jest.fn() },
      examAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new AssignmentsService(prisma as PrismaService);
  });

  it('creates a future assignment and reports PENDING status', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.examAssignment.findFirst.mockResolvedValue(null);
    prisma.examAssignment.create.mockResolvedValue(assignment);

    await expect(
      service.create({ userId: 'student-1', examId: 'exam-1', dueAt: dueAt.toISOString() }),
    ).resolves.toEqual(expect.objectContaining({ id: 'assignment-1', status: AssignmentStatus.PENDING }));
  });

  it('rejects unknown users, expired due dates and duplicates', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    await expect(
      service.create({ userId: 'missing', examId: 'exam-1', dueAt: dueAt.toISOString() }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    await expect(
      service.create({ userId: 'student-1', examId: 'exam-1', dueAt: new Date(Date.now() - 1000).toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.examAssignment.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create({ userId: 'student-1', examId: 'exam-1', dueAt: dueAt.toISOString() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters assignments by the authenticated student and status', async () => {
    prisma.examAssignment.findMany.mockResolvedValue([
      assignment,
      { ...assignment, id: 'assignment-2', dueAt: new Date(Date.now() - 1000), examAttempts: [] },
      { ...assignment, id: 'assignment-3', examAttempts: [{ id: 'a', status: AttemptStatus.COMPLETED, correctCount: 1, totalQuestions: 1 }] },
    ]);

    const result = await service.findAll({ status: AssignmentStatus.COMPLETED }, 'student-1');
    expect(prisma.examAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'student-1' }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(AssignmentStatus.COMPLETED);
  });

  it('hides another student assignment as not found', async () => {
    prisma.examAssignment.findUnique.mockResolvedValue(assignment);

    await expect(service.findOne('assignment-1', 'another-student')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates and removes an assignment after checking it exists', async () => {
    prisma.examAssignment.findUnique.mockResolvedValue(assignment);
    prisma.examAssignment.update.mockResolvedValue(assignment);
    prisma.examAssignment.delete.mockResolvedValue(assignment);

    await service.update('assignment-1', { dueAt: dueAt.toISOString() });
    await service.remove('assignment-1');
    expect(prisma.examAssignment.update).toHaveBeenCalled();
    expect(prisma.examAssignment.delete).toHaveBeenCalledWith({ where: { id: 'assignment-1' } });
  });
});
