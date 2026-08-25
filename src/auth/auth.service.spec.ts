import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccessLevel, UserRole } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const dateOfBirth = new Date('2005-05-20T00:00:00.000Z');
  const persistedUser = {
    id: 'user-1',
    email: 'student@example.com',
    passwordHash: 'hashed-password',
    fullName: 'Nguyen Van A',
    phone: '0901234567',
    dateOfBirth,
    role: UserRole.STUDENT,
    isActive: true,
    accessLevel: AccessLevel.FREE,
    lastLoginAt: null,
    proExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const safeUser = {
    id: persistedUser.id,
    email: persistedUser.email,
    fullName: persistedUser.fullName,
    phone: persistedUser.phone,
    dateOfBirth: persistedUser.dateOfBirth,
    role: persistedUser.role,
    isActive: persistedUser.isActive,
    accessLevel: persistedUser.accessLevel,
    lastLoginAt: now,
    proExpiresAt: persistedUser.proExpiresAt,
  };

  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  const compareMock = bcrypt.compare as jest.Mock;
  const hashMock = bcrypt.hash as jest.Mock;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn(),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('normalizes profile data, hashes the password, and never returns passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      hashMock.mockResolvedValue('new-password-hash');
      prisma.user.create.mockResolvedValue({
        ...safeUser,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.register({
        email: '  Student@Example.COM ',
        password: 'password123',
        fullName: '  Nguyen Van A  ',
        phone: '  0901234567  ',
        dateOfBirth: '2005-05-20',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'student@example.com' },
      });
      expect(hashMock).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            email: 'student@example.com',
            passwordHash: 'new-password-hash',
            fullName: 'Nguyen Van A',
            phone: '0901234567',
            dateOfBirth,
          },
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when the normalized email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(persistedUser);

      await expect(
        service.register({
          email: ' STUDENT@example.com ',
          password: 'password123',
          fullName: 'Nguyen Van A',
          phone: '0901234567',
          dateOfBirth: '2005-05-20',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws ForbiddenException when the account is locked', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...persistedUser,
        isActive: false,
      });

      await expect(
        service.login({ email: persistedUser.email, password: 'password123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(compareMock).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the password is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(persistedUser);
      compareMock.mockResolvedValue(false);

      await expect(
        service.login({ email: persistedUser.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates lastLoginAt, signs a token, and returns a safe user', async () => {
      prisma.user.findUnique.mockResolvedValue(persistedUser);
      compareMock.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue(safeUser);
      jwtService.signAsync.mockResolvedValue('access-token');

      const result = await service.login({
        email: ' STUDENT@EXAMPLE.COM ',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: persistedUser.email },
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: persistedUser.id },
          data: { lastLoginAt: expect.any(Date) },
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: persistedUser.id,
        email: persistedUser.email,
        role: persistedUser.role,
      });
      expect(result).toEqual({ accessToken: 'access-token', user: safeUser });
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('getMe', () => {
    it('returns the active user profile without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(safeUser);

      const result = await service.getMe(persistedUser.id);

      expect(result).toBe(safeUser);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('missing-user')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when the account is locked', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...safeUser, isActive: false });

      await expect(service.getMe(persistedUser.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('changePassword', () => {
    it('hashes and saves the new password when the old password is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(persistedUser);
      compareMock.mockResolvedValue(true);
      hashMock.mockResolvedValue('new-password-hash');
      prisma.user.update.mockResolvedValue(persistedUser);

      await expect(
        service.changePassword(persistedUser.id, {
          oldPassword: 'password123',
          newPassword: 'new-password123',
        }),
      ).resolves.toEqual({ message: 'Password changed successfully' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: persistedUser.id },
        data: { passwordHash: 'new-password-hash' },
      });
    });

    it('throws UnauthorizedException when the old password is incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(persistedUser);
      compareMock.mockResolvedValue(false);

      await expect(
        service.changePassword(persistedUser.id, {
          oldPassword: 'wrong-password',
          newPassword: 'new-password123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks password changes for inactive users', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...persistedUser,
        isActive: false,
      });

      await expect(
        service.changePassword(persistedUser.id, {
          oldPassword: 'password123',
          newPassword: 'new-password123',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(compareMock).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
