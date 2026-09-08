import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccessLevel, UserRole } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EmailVerificationTokenService } from './email-verification-token.service';
import { EmailService } from './email.service';


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
    tokenVersion: 0,
    fullName: 'Nguyen Van A',
    phone: '0901234567',
    dateOfBirth,
    role: UserRole.STUDENT,
    isActive: true,
    accessLevel: AccessLevel.FREE,
    lastLoginAt: null,
    proExpiresAt: null,
    emailVerifiedAt: now,
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
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let transactionClient: {
    user: {
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let tokenService: {
    issue: jest.Mock;
    consume: jest.Mock;
  };
  let emailService: {
    sendVerificationEmail: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  const compareMock = bcrypt.compare as jest.Mock;
  const hashMock = bcrypt.hash as jest.Mock;

  beforeEach(() => {
    transactionClient = {
      user: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transactionClient) => unknown) =>
          callback(transactionClient),
      ),
    };
    jwtService = {
      signAsync: jest.fn(),
    };

    tokenService = {
      issue: jest.fn().mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt: new Date(),
      }),
      consume: jest.fn(),
    };

    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue({
        provider: 'console',
      }),
    };
    configService = {
      get: jest.fn((key: string) => ({
        EMAIL_RESEND_COOLDOWN_SECONDS: '60',
        EMAIL_RESEND_MAX_ATTEMPTS: '5',
        EMAIL_RESEND_WINDOW_MINUTES: '60',
      }[key])),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      tokenService as unknown as EmailVerificationTokenService,
      emailService as unknown as EmailService,
      configService as unknown as ConfigService,
    );
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('normalizes profile data, hashes the password, and never returns passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      hashMock.mockResolvedValue('new-password-hash');
      transactionClient.user.create.mockResolvedValue({
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
      expect(transactionClient.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'student@example.com',
            passwordHash: 'new-password-hash',
            fullName: 'Nguyen Van A',
            phone: '0901234567',
            dateOfBirth,
            emailVerifiedAt: null,
            verificationEmailLastRequestedAt: expect.any(Date),
            verificationEmailWindowStartedAt: expect.any(Date),
            verificationEmailRequestCount: 1,
          }),
        }),
      );
      expect(tokenService.issue).toHaveBeenCalledWith(
        persistedUser.id,
        transactionClient,
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: persistedUser.email,
        fullName: persistedUser.fullName,
        rawToken: 'raw-token',
      });
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
      expect(transactionClient.user.create).not.toHaveBeenCalled();
    });

    it('resends verification instead of creating a duplicate for an unverified email', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...persistedUser,
        emailVerifiedAt: null,
      });

      await expect(
        service.register({
          email: ' STUDENT@example.com ',
          password: 'password123',
          fullName: 'New Name Should Not Replace Existing User',
        }),
      ).resolves.toEqual({
        message:
          'Account already exists but is not verified. A new verification email has been sent.',
        email: persistedUser.email,
        verificationRequired: true,
      });

      expect(hashMock).not.toHaveBeenCalled();
      expect(transactionClient.user.create).not.toHaveBeenCalled();
      expect(tokenService.issue).toHaveBeenCalledWith(
        persistedUser.id,
        transactionClient,
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: persistedUser.email,
        fullName: persistedUser.fullName,
        rawToken: 'raw-token',
      });
    });

    it('registers successfully with only the required fields', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      hashMock.mockResolvedValue('new-password-hash');
      transactionClient.user.create.mockResolvedValue({
        ...safeUser,
        phone: null,
        dateOfBirth: null,
      });

      await service.register({
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New Student',
      });

      expect(transactionClient.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: null, dateOfBirth: null }),
        }),
      );
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
        tokenVersion: persistedUser.tokenVersion,
      });
      expect(result).toEqual({ accessToken: 'access-token', user: safeUser });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('blocks login when the email is not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...persistedUser,
        emailVerifiedAt: null,
      });
      compareMock.mockResolvedValue(true);

      await expect(
        service.login({
          email: persistedUser.email,
          password: 'password123',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'EMAIL_NOT_VERIFIED',
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token and returns the verified email', async () => {
      tokenService.consume.mockResolvedValue({ userId: persistedUser.id });
      prisma.user.findUnique.mockResolvedValue({
        email: persistedUser.email,
      });

      await expect(service.verifyEmail(' raw-token ')).resolves.toEqual({
        message: 'Email verified successfully. You can now log in.',
        email: persistedUser.email,
      });

      expect(tokenService.consume).toHaveBeenCalledWith(' raw-token ');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: persistedUser.id },
        select: { email: true },
      });
    });

    it('propagates an invalid token error', async () => {
      tokenService.consume.mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(
        'Invalid token',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('issues a new token and sends another email for an unverified user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: persistedUser.id,
        email: persistedUser.email,
        fullName: persistedUser.fullName,
        emailVerifiedAt: null,
        verificationEmailLastRequestedAt: null,
        verificationEmailWindowStartedAt: null,
        verificationEmailRequestCount: 0,
      });

      const result = await service.resendVerification(
        ' STUDENT@EXAMPLE.COM ',
      );

      expect(result.message).toBe(
        'If the account exists and is not verified, a new verification email has been sent.',
      );
      expect(tokenService.issue).toHaveBeenCalledWith(
        persistedUser.id,
        transactionClient,
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: persistedUser.email,
        fullName: persistedUser.fullName,
        rawToken: 'raw-token',
      });
    });

    it('returns a generic response when the email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification(
        'missing@example.com',
      );

      expect(result.message).toBe(
        'If the account exists and is not verified, a new verification email has been sent.',
      );
      expect(tokenService.issue).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('does not issue another token for an already verified user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: persistedUser.id,
        email: persistedUser.email,
        fullName: persistedUser.fullName,
        emailVerifiedAt: persistedUser.emailVerifiedAt,
        verificationEmailLastRequestedAt: null,
        verificationEmailWindowStartedAt: null,
        verificationEmailRequestCount: 0,
      });

      await service.resendVerification(persistedUser.email);

      expect(tokenService.issue).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('rejects resend requests during the cooldown period', async () => {
      const lastRequestedAt = new Date(Date.now() - 30_000);
      prisma.user.findUnique.mockResolvedValue({
        id: persistedUser.id,
        email: persistedUser.email,
        fullName: persistedUser.fullName,
        emailVerifiedAt: null,
        verificationEmailLastRequestedAt: lastRequestedAt,
        verificationEmailWindowStartedAt: new Date(Date.now() - 30_000),
        verificationEmailRequestCount: 1,
      });

      await expect(
        service.resendVerification(persistedUser.email),
      ).rejects.toMatchObject({
        response: {
          code: 'EMAIL_RESEND_COOLDOWN',
          retryAfterSeconds: expect.any(Number),
        },
      });

      expect(tokenService.issue).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('rejects resend requests after the maximum attempts in the window', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: persistedUser.id,
        email: persistedUser.email,
        fullName: persistedUser.fullName,
        emailVerifiedAt: null,
        verificationEmailLastRequestedAt: new Date(Date.now() - 120_000),
        verificationEmailWindowStartedAt: new Date(Date.now() - 30 * 60_000),
        verificationEmailRequestCount: 5,
      });

      await expect(
        service.resendVerification(persistedUser.email),
      ).rejects.toMatchObject({
        response: {
          code: 'EMAIL_RESEND_RATE_LIMITED',
          retryAfterSeconds: expect.any(Number),
        },
      });

      expect(tokenService.issue).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
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
