import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(
      { getOrThrow: jest.fn().mockReturnValue('secret') } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('accepts a token when its version matches the user', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 2 });
    const payload = { sub: 'student-1', email: 'student@example.com', role: 'STUDENT', tokenVersion: 2 };

    await expect(strategy.validate(payload)).resolves.toBe(payload);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      select: { tokenVersion: true },
    });
  });

  it('treats a missing token version as zero for backwards compatibility', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });

    await expect(
      strategy.validate({ sub: 'student-1', email: 'student@example.com', role: 'STUDENT' }),
    ).resolves.toEqual({ sub: 'student-1', email: 'student@example.com', role: 'STUDENT' });
  });

  it('rejects a token after its version has been incremented', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });

    await expect(
      strategy.validate({ sub: 'student-1', email: 'student@example.com', role: 'STUDENT', tokenVersion: 2 }),
    ).rejects.toEqual(new UnauthorizedException('Session revoked'));
  });

  it('rejects a token for a deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'student-1', email: 'student@example.com', role: 'STUDENT', tokenVersion: 0 }),
    ).rejects.toEqual(new UnauthorizedException('User not found'));
  });
});
