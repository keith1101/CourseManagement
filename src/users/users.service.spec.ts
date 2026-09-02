import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  const date = new Date('2026-08-25T00:00:00.000Z');
  const safeUser = {
    id: 'user-1',
    email: 'student@example.com',
    fullName: 'Student One',
    phone: '0900000000',
    dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    role: 'STUDENT',
    isActive: true,
    accessLevel: 'FREE',
    proExpiresAt: null,
    lastLoginAt: date,
    createdAt: date,
    updatedAt: date,
  };

  let service: UsersService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new UsersService(prisma as PrismaService);
  });

  it('lists users with a safe select that excludes passwordHash', async () => {
    prisma.user.findMany.mockResolvedValue([safeUser]);

    await expect(service.findAll('student')).resolves.toEqual([safeUser]);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where.OR).toHaveLength(3);
    expect(args.select).not.toHaveProperty('passwordHash');
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('returns a user detail without passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(safeUser);

    await expect(service.find(safeUser.id)).resolves.toBe(safeUser);
    expect(prisma.user.findUnique.mock.calls[0][0].select).not.toHaveProperty(
      'passwordHash',
    );
  });

  it('throws 404 for an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.find('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['lock', false],
    ['unlock', true],
  ])('%s updates the account status', async (operation, value) => {
    prisma.user.findUnique.mockResolvedValue(safeUser);
    prisma.user.update.mockResolvedValue({ ...safeUser, isActive: value });

    await expect((service as any)[operation](safeUser.id)).resolves.toEqual({
      ...safeUser,
      isActive: value,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: safeUser.id },
        data: { isActive: value },
      }),
    );
  });

  it('rejects an admin from locking their own account', async () => {
    await expect(service.lock(safeUser.id, safeUser.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects self-lock through the generic user update endpoint', async () => {
    await expect(
      service.update(safeUser.id, { isActive: false } as any, safeUser.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ role: 'STUDENT' }],
    [{ accessLevel: 'PRO' }],
    [{ proExpiresAt: null }],
  ])('rejects an admin from changing their own permissions: %o', async (payload) => {
    await expect(
      service.update(safeUser.id, payload as any, safeUser.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(['updatePro', 'updateFree'])('%s rejects changing own permissions', async (operation) => {
    await expect((service as any)[operation](safeUser.id, safeUser.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates profile fields and maps date strings to Date values', async () => {
    prisma.user.findUnique.mockResolvedValue(safeUser);
    prisma.user.update.mockResolvedValue(safeUser);

    await service.update(safeUser.id, {
      fullName: 'Updated Name',
      dateOfBirth: '2001-02-03',
    } as any);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fullName: 'Updated Name',
          dateOfBirth: new Date('2001-02-03'),
          proExpiresAt: undefined,
        },
      }),
    );
  });

  describe('resetPassword', () => {
    const hashMock = bcrypt.hash as jest.Mock;

    it('hashes the new password and increments the token version for a student', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      hashMock.mockResolvedValue('new-password-hash');

      await expect(
        service.resetPassword('student-1', { newPassword: 'password123' }),
      ).resolves.toEqual({ message: 'Password reset successfully' });

      expect(hashMock).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: {
          passwordHash: 'new-password-hash',
          tokenVersion: { increment: 1 },
        },
      });
    });

    it('rejects resetting an admin account', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      await expect(
        service.resetPassword('admin-1', { newPassword: 'password123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(hashMock).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the reset target does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('missing', { newPassword: 'password123' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(hashMock).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
