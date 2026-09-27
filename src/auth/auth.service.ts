import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
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

const DUMMY_PASSWORD_HASH =
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly emailVerificationTokenService: EmailVerificationTokenService,
        private readonly emailService: EmailService,
        private readonly configService: ConfigService,
    ) { }

    async register(registerDto: RegisterDto) {
        const email = this.normalizeEmail(registerDto.email);
        const result = {
            message: 'If registration is available, verification instructions will be sent.',
            email,
            verificationRequired: true,
        };

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, emailVerifiedAt: true },
        });

        if (existingUser) {
            if (!existingUser.emailVerifiedAt) {
                try {
                    await this.resendVerification(email);
                } catch {
                    // Preserve the same public response for every account state.
                    this.logger.warn('Registration verification flow could not be processed.');
                }
            }
            return result;
        }

        const verificationEmailRequestedAt = new Date();

        let registration: {
            user: { email: string; fullName: string };
            rawToken: string;
        };
        try {
            registration = await this.createRegistration(
                registerDto,
                email,
                verificationEmailRequestedAt,
            );
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                return result;
            }
            // Keep account creation failures from becoming an email-existence
            // oracle. Operational details remain in server-side logs only.
            this.logger.warn('Registration could not be completed.');
            return result;
        }

        try {
            await this.emailService.sendVerificationEmail({
                to: registration.user.email,
                fullName: registration.user.fullName,
                rawToken: registration.rawToken,
            });
        } catch {
            // Keep public registration responses independent of whether the
            // address was created; delivery problems are handled on resend.
            this.logger.warn('Verification email delivery failed during registration.');
        }

        return result;
    }

    private async createRegistration(
        registerDto: RegisterDto,
        email: string,
        verificationEmailRequestedAt: Date,
    ) {
        const { dateOfBirth } = registerDto;
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    passwordHash: null,
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
    }

    async login(loginDto: LoginDto) {
        const { password } = loginDto;
        const email = this.normalizeEmail(loginDto.email);

        const user = await this.prisma.user.findUnique({
            where: { email }
        });

        const isPasswordValid = await bcrypt.compare(
            password,
            user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );

        if (
            !user ||
            !user.passwordHash ||
            !user.isActive ||
            !user.emailVerifiedAt ||
            !isPasswordValid
        ) {
            throw new UnauthorizedException('Invalid email or password');
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

        if (!user.passwordHash) {
            throw new UnauthorizedException('Old password is incorrect');
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

    async verifyEmail(rawToken: string, password: string) {
        await this.emailVerificationTokenService.assertUsable(rawToken);
        const passwordHash = await bcrypt.hash(password, 10);
        const { userId } = await this.emailVerificationTokenService.consume(
            rawToken,
            passwordHash,
        );

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

        let verification: {
            rawToken: string;
            email: string;
            fullName: string;
        } | null;
        try {
            verification = await this.prisma.$transaction(async (tx) => {
                const currentUser = await tx.user.findUnique({
                    where: { id: user.id },
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

                if (!currentUser || currentUser.emailVerifiedAt) return null;

                const policy = this.getResendPolicy();
                const now = new Date();
                this.assertResendAllowed(currentUser, now, policy);

                const windowIsActive =
                    currentUser.verificationEmailWindowStartedAt &&
                    now.getTime() - currentUser.verificationEmailWindowStartedAt.getTime() <
                        policy.windowMs;
                const requestCount = windowIsActive
                    ? currentUser.verificationEmailRequestCount + 1
                    : 1;
                const windowStartedAt = windowIsActive
                    ? currentUser.verificationEmailWindowStartedAt
                    : now;

                // Compare-and-swap the policy state before issuing a token.
                // Concurrent requests that observed the same state cannot
                // both claim a slot or invalidate each other's email token.
                const claimed = await tx.user.updateMany({
                    where: {
                        id: currentUser.id,
                        emailVerifiedAt: null,
                        verificationEmailLastRequestedAt:
                            currentUser.verificationEmailLastRequestedAt,
                        verificationEmailWindowStartedAt:
                            currentUser.verificationEmailWindowStartedAt,
                        verificationEmailRequestCount:
                            currentUser.verificationEmailRequestCount,
                    },
                    data: {
                        verificationEmailLastRequestedAt: now,
                        verificationEmailWindowStartedAt: windowStartedAt,
                        verificationEmailRequestCount: requestCount,
                    },
                });

                if (claimed.count !== 1) {
                    throw new HttpException(
                        { code: 'EMAIL_RESEND_RATE_LIMITED', message },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }

                const issued = await this.emailVerificationTokenService.issue(
                    currentUser.id,
                    tx,
                );
                return {
                    ...issued,
                    email: currentUser.email,
                    fullName: currentUser.fullName,
                };
            });
        } catch (error) {
            if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
                return { message };
            }
            this.logger.warn('Verification resend could not be processed.');
            return { message };
        }

        if (!verification) return { message };

        try {
            await this.emailService.sendVerificationEmail({
                to: verification.email,
                fullName: verification.fullName,
                rawToken: verification.rawToken,
            });
        } catch {
            this.logger.warn('Verification email delivery failed during resend.');
        }

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
