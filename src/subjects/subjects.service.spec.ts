import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubjectsService } from './subjects.service';

describe('SubjectsService', () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const subject = {
    id: 'subject-1',
    code: 'MATH',
    name: 'Mathematics',
    description: null,
    displayOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  let service: SubjectsService;
  let prisma: {
    subject: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      subject: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SubjectsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a subject when its code is available', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);
      prisma.subject.create.mockResolvedValue(subject);

      await expect(
        service.create({
          code: subject.code,
          name: subject.name,
          displayOrder: subject.displayOrder,
        }),
      ).resolves.toBe(subject);
      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: {
          code: subject.code,
          name: subject.name,
          displayOrder: subject.displayOrder,
        },
      });
    });

    it('throws ConflictException when the code already exists', async () => {
      prisma.subject.findFirst.mockResolvedValue({ id: 'existing-subject' });

      await expect(
        service.create({ code: 'MATH', name: 'Math', displayOrder: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.subject.create).not.toHaveBeenCalled();
    });

    it('maps a concurrent Prisma unique violation to ConflictException', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);
      prisma.subject.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.9.1',
          meta: { target: ['code'] },
        }),
      );

      await expect(
        service.create({ code: 'MATH', name: 'Math', displayOrder: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns active subjects ordered by displayOrder', async () => {
      prisma.subject.findMany.mockResolvedValue([subject]);

      await expect(service.findAll()).resolves.toEqual([subject]);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns an active subject', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject);

      await expect(service.findOne(subject.id)).resolves.toBe(subject);
    });

    it.each([
      ['missing', null],
      ['inactive', { ...subject, isActive: false }],
    ])('throws NotFoundException for an %s subject', async (_case, value) => {
      prisma.subject.findUnique.mockResolvedValue(value);

      await expect(service.findOne(subject.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an active subject and excludes its own ID from code lookup', async () => {
      prisma.subject.findFirst
        .mockResolvedValueOnce(subject)
        .mockResolvedValueOnce(null);
      prisma.subject.update.mockResolvedValue({ ...subject, name: 'Math' });

      await service.update(subject.id, { code: 'MATH', name: 'Math' });

      expect(prisma.subject.findFirst).toHaveBeenNthCalledWith(2, {
        where: { code: 'MATH', id: { not: subject.id } },
        select: { id: true },
      });
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: subject.id },
        data: { code: 'MATH', name: 'Math' },
      });
    });

    it('throws NotFoundException instead of updating an inactive subject', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);

      await expect(
        service.update(subject.id, { name: 'Math' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when changing to an existing code', async () => {
      prisma.subject.findFirst
        .mockResolvedValueOnce(subject)
        .mockResolvedValueOnce({ id: 'another-subject' });

      await expect(
        service.update(subject.id, { code: 'SCIENCE' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft deletes an active subject', async () => {
      prisma.subject.findFirst.mockResolvedValue(subject);
      prisma.subject.update.mockResolvedValue({ ...subject, isActive: false });

      await expect(service.remove(subject.id)).resolves.toEqual({
        ...subject,
        isActive: false,
      });
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: subject.id },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException when deleting a missing or inactive subject', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);

      await expect(service.remove(subject.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });
  });
});
