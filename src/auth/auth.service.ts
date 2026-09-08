import {
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma } from '../../generated/client/client';
import { EmailVerificationTokenService } from './email-verification-token.service';
import { EmailService } from './email.service';


@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly emailVerificationTokenService: EmailVerificationTokenService,
        private readonly emailService: EmailService,
        private readonly configService: ConfigService,
    ) { }

    async register(registerDto: RegisterDto) {
        const { password, dateOfBirth } = registerDto;
        const email = this.normalizeEmail(registerDto.email);

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            if (!existingUser.emailVerifiedAt) {
                await this.resendVerification(email);

                return {
                    message:
                        'Account already exists but is not verified. A new verification email has been sent.',
                    email,
                    verificationRequired: true,
                };
            }

            throw new ConflictException('Email already exists');
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const verificationEmailRequestedAt = new Date();

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        email,
                        passwordHash,
                        fullName: registerDto.fullName.trim(),
                        phone: registerDto.phone?.trim() || null,
                        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                        emailVerifiedAt: null,
                        verificationEmailLastRequestedAt: verificationEmailRequestedAt,
                        verificationEmailWindowStartedAt: verificationEmailRequestedAt,
                        verificationEmailRequestCount: 1,
                    },
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        phone: true,
                        dateOfBirth: true,
                        role: true,
                        isActive: true,
                        accessLevel: true,
                        proExpiresAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                });

                const verification = await this.emailVerificationTokenService.issue(
                    user.id,
                    tx,
                );

                return {
                    user,
                    rawToken: verification.rawToken,
                    expiresAt: verification.expiresAt,
                };
            });

            await this.emailService.sendVerificationEmail({
                to: result.user.email,
                fullName: result.user.fullName,
                rawToken: result.rawToken,
            });

            return {
                message: 'Registration successful. Please verify your email.',
                email: result.user.email,
                verificationRequired: true,
            };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email already exists');
            }

            throw error;
        }
    }

    async login(loginDto: LoginDto) {
        const { password } = loginDto;
        const email = this.normalizeEmail(loginDto.email);

        const user = await this.prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password'); //exception
        }

        if (user.isActive === false) {
            throw new ForbiddenException('Account is locked');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (!user.emailVerifiedAt) {
            throw new ForbiddenException({
                code: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email before logging in',
            });
        }

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            tokenVersion: user.tokenVersion,
        }

        const loggedInUser = await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                dateOfBirth: true,
                role: true,
                isActive: true,
                accessLevel: true,
                lastLoginAt: true,
                proExpiresAt: true,
            },
        });

        const accessToken = await this.jwtService.signAsync(payload);
        return {
            accessToken,
            user: loggedInUser,
        };
    }

    async getMe(userId: string) {

        const user = await this.prisma.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                dateOfBirth: true,
                role: true,
                isActive: true,
                accessLevel: true,
                lastLoginAt: true,
                proExpiresAt: true,
                createdAt: true,
                updatedAt: true,
            }
        })

        if (!user) {
            throw new UnauthorizedException('User not found!');
        }

        if (!user.isActive) {
            throw new ForbiddenException('Account is locked');
        }

        return user;
    }

    async changePassword(
        userId: string,
        changePasswordDto: ChangePasswordDto,
    ) {
        const { oldPassword, newPassword } = changePasswordDto;

        const user = await this.prisma.user.findUnique({
            where: {
                id: userId,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        if (!user.isActive) {
            throw new ForbiddenException('Account is locked');
        }

        const isOldPasswordValid = await bcrypt.compare(
            oldPassword,
            user.passwordHash,
        );

        if (!isOldPasswordValid) {
            throw new UnauthorizedException('Old password is incorrect');
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: {
                id: userId,
            },
            data: {
                passwordHash: newPasswordHash,
            },
        });

        return {
            message: 'Password changed successfully',
        };

    }

    private normalizeEmail(email: string): string {
        return email.trim().toLowerCase();
    }

    async verifyEmail(rawToken: string) {
        const { userId } =
            await this.emailVerificationTokenService.consume(rawToken);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return {
            message: 'Email verified successfully. You can now log in.',
            email: user.email,
        };
    }

    async resendVerification(emailInput: string) {
        const email = this.normalizeEmail(emailInput);

        const user = await this.prisma.user.findUnique({
            where: {email},
            select: {
                id: true,
                email: true,
                fullName: true,
                emailVerifiedAt: true,
                verificationEmailLastRequestedAt: true,
                verificationEmailWindowStartedAt: true,
                verificationEmailRequestCount: true,
            },
        });

        const message =
            'If the account exists and is not verified, a new verification email has been sent.';

        if (!user || user.emailVerifiedAt) {
            return { message };
        }

        const policy = this.getResendPolicy();
        const now = new Date();
        this.assertResendAllowed(user, now, policy);

        const windowIsActive =
            user.verificationEmailWindowStartedAt &&
            now.getTime() - user.verificationEmailWindowStartedAt.getTime() <
            policy.windowMs;
        const requestCount = windowIsActive
            ? (user.verificationEmailRequestCount ?? 0) + 1
            : 1;
        const windowStartedAt = windowIsActive
            ? user.verificationEmailWindowStartedAt
            : now;

        const verification = await this.prisma.$transaction(async (tx) => {
            const issuedVerification =
                await this.emailVerificationTokenService.issue(user.id, tx);

            await tx.user.update({
                where: { id: user.id },
                data: {
                    verificationEmailLastRequestedAt: now,
                    verificationEmailWindowStartedAt: windowStartedAt,
                    verificationEmailRequestCount: requestCount,
                },
            });

            return issuedVerification;
        });

        await this.emailService.sendVerificationEmail({
            to: user.email,
            fullName: user.fullName,
            rawToken: verification.rawToken,
        });

        return { message };
    }

    private getResendPolicy() {
        const cooldownSeconds = this.getPositiveIntegerConfig(
            'EMAIL_RESEND_COOLDOWN_SECONDS',
            60,
        );
        const maxAttempts = this.getPositiveIntegerConfig(
            'EMAIL_RESEND_MAX_ATTEMPTS',
            5,
        );
        const windowMinutes = this.getPositiveIntegerConfig(
            'EMAIL_RESEND_WINDOW_MINUTES',
            60,
        );

        return {
            cooldownMs: cooldownSeconds * 1000,
            maxAttempts,
            windowMs: windowMinutes * 60 * 1000,
        };
    }

    private getPositiveIntegerConfig(name: string, fallback: number): number {
        const configuredValue = this.configService.get<string>(name);
        const value = configuredValue === undefined
            ? fallback
            : Number(configuredValue);

        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${name} must be a positive integer`);
        }

        return value;
    }

    private assertResendAllowed(
        user: {
            verificationEmailLastRequestedAt: Date | null;
            verificationEmailWindowStartedAt: Date | null;
            verificationEmailRequestCount: number;
        },
        now: Date,
        policy: {
            cooldownMs: number;
            maxAttempts: number;
            windowMs: number;
        },
    ): void {
        if (user.verificationEmailLastRequestedAt) {
            const cooldownEndsAt = new Date(
                user.verificationEmailLastRequestedAt.getTime() + policy.cooldownMs,
            );
            const cooldownRemainingSeconds = Math.ceil(
                (cooldownEndsAt.getTime() - now.getTime()) / 1000,
            );

            if (cooldownRemainingSeconds > 0) {
                throw new HttpException({
                    code: 'EMAIL_RESEND_COOLDOWN',
                    message: `Vui lòng chờ ${cooldownRemainingSeconds} giây trước khi yêu cầu gửi lại email.`,
                    retryAfterSeconds: cooldownRemainingSeconds,
                }, HttpStatus.TOO_MANY_REQUESTS);
            }
        }

        if (
            user.verificationEmailWindowStartedAt &&
            now.getTime() - user.verificationEmailWindowStartedAt.getTime() <
            policy.windowMs &&
            user.verificationEmailRequestCount >= policy.maxAttempts
        ) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (user.verificationEmailWindowStartedAt.getTime() +
                        policy.windowMs -
                        now.getTime()) /
                    1000,
                ),
            );

            throw new HttpException({
                code: 'EMAIL_RESEND_RATE_LIMITED',
                message:
                    'Bạn đã yêu cầu quá nhiều email xác nhận. Vui lòng thử lại sau.',
                retryAfterSeconds,
            }, HttpStatus.TOO_MANY_REQUESTS);
        }
    }
}
