import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

type TokenDb = Pick<PrismaService, 'emailVerificationToken'>;

@Injectable()
export class EmailVerificationTokenService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) { }

    async issue(
        userId: string,
        db: TokenDb = this.prisma,
    ): Promise<{ rawToken: string; expiresAt: Date }> {
        const ttlMinutes = Number(
            this.configService.get<string>(
                'EMAIL_VERIFICATION_TTL_MINUTES',
            ) ?? '1440',
        );

        if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
            throw new Error('EMAIL_VERIFICATION_TTL_MINUTES must be positive');
        }

        const rawToken = randomBytes(32).toString('hex');
        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + ttlMinutes * 60 * 1000,
        );

        await db.emailVerificationToken.deleteMany({
            where: {
                userId,
                usedAt: null,
            },
        });

        await db.emailVerificationToken.create({
            data: {
                userId,
                tokenHash: this.hashToken(rawToken),
                expiresAt,
            },
        });

        return {
            rawToken,
            expiresAt,
        };
    }

    async consume(rawToken: string): Promise<{ userId: string }> {
        const token = rawToken.trim();

        if (!token) {
            throw this.invalidToken();
        }

        const tokenHash = this.hashToken(token);
        const now = new Date();

        const storedToken = await this.prisma.emailVerificationToken.findUnique({
            where: { tokenHash },
        });

        if (
            !storedToken || storedToken.usedAt || storedToken.expiresAt <= now) {
            throw this.invalidToken();
        }

        return this.prisma.$transaction(async (tx) => {
            const claimed = await tx.emailVerificationToken.updateMany({
                where: {
                    id: storedToken.id,
                    usedAt: null,
                    expiresAt: {gt: now},
                },
                data: {
                    usedAt: now,
                },
            });

            if (claimed.count !== 1) {
                throw this.invalidToken();
            }

            await tx.user.updateMany({
                where: {
                    id: storedToken.userId,
                    emailVerifiedAt: null,
                },
                data: {
                    emailVerifiedAt: now,
                },
            });

            await tx.emailVerificationToken.deleteMany({
                where: {
                    userId: storedToken.userId,
                    id: {not: storedToken.id},
                },
            });

            return {
                userId: storedToken.userId,
            };
        });
    }
    private hashToken(rawToken: string): string {
        return createHash('sha256').update(rawToken, 'utf8').digest('hex');
    }

    private invalidToken(): BadRequestException {
        return new BadRequestException({
            code: 'INVALID_EMAIL_VERIFICATION_TOKEN',
            message: 'Liên kết xác nhận email không hợp lệ hoặc đã hết hạn.',
        });
    }
}