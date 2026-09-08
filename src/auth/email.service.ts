import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gmail_v1, google } from 'googleapis';

export interface VerificationEmailPayload {
    to: string;
    fullName: string;
    rawToken: string;
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private readonly provider: string;
    private readonly gmail: gmail_v1.Gmail | null;

    constructor(private readonly configService: ConfigService) {
        const configuredProvider = this.configService
            .get<string>('EMAIL_PROVIDER')
            ?.trim()
            .toLowerCase();

        const hasGmailConfig = [
            'GMAIL_CLIENT_ID',
            'GMAIL_CLIENT_SECRET',
            'GMAIL_REFRESH_TOKEN',
            'GMAIL_SENDER_EMAIL',
        ].every((key) => Boolean(this.configService.get<string>(key)?.trim()));

        this.provider = configuredProvider || (hasGmailConfig ? 'gmail' : 'console');
        this.gmail = this.createGmailClient();
    }

    async sendVerificationEmail(
        payload: VerificationEmailPayload,
    ): Promise<{ provider: string; messageId?: string }> {
        const verificationUrl = this.buildVerificationUrl(payload.rawToken);

        if (this.provider === 'console') {
            if (process.env.NODE_ENV === 'production') {
                throw new ServiceUnavailableException(
                    'Email service is not configured',
                );
            }

            this.logger.warn(
                `Verification URL for ${payload.to}: ${verificationUrl}`,
            );

            return { provider: 'console' };
        }

        if (this.provider !== 'gmail' || !this.gmail) {
            throw new ServiceUnavailableException(
                'Gmail email service is not configured',
            );
        }

        const senderEmail = this.configService
            .get<string>('GMAIL_SENDER_EMAIL')
            ?.trim();

        if (!senderEmail || !this.isValidEmail(senderEmail)) {
            throw new ServiceUnavailableException(
                'GMAIL_SENDER_EMAIL must be a valid email address',
            );
        }

        if (!this.isValidEmail(payload.to)) {
            throw new ServiceUnavailableException(
                'Recipient email must be a valid email address',
            );
        }

        const rawMessage = this.createRawMessage(
            senderEmail,
            payload.to,
            payload.fullName,
            verificationUrl,
        );

        try {
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: Buffer.from(rawMessage, 'utf8').toString('base64url'),
                },
            });

            return {
                provider: 'gmail',
                messageId: response.data.id ?? undefined,
            };
        } catch (error) {
            this.logger.error(
                'Gmail API rejected verification email',
                error instanceof Error ? error.message : undefined,
            );

            throw new ServiceUnavailableException(
                'Unable to send verification email',
            );
        }
    }

    private createGmailClient(): gmail_v1.Gmail | null {
        const clientId = this.configService
            .get<string>('GMAIL_CLIENT_ID')
            ?.trim();
        const clientSecret = this.configService
            .get<string>('GMAIL_CLIENT_SECRET')
            ?.trim();
        const refreshToken = this.configService
            .get<string>('GMAIL_REFRESH_TOKEN')
            ?.trim();

        if (!clientId || !clientSecret || !refreshToken) {
            return null;
        }

        const redirectUri = this.configService
            .get<string>('GMAIL_REDIRECT_URI')
            ?.trim();

        const auth = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri || undefined,
        );

        auth.setCredentials({
            refresh_token: refreshToken,
        });

        return google.gmail({
            version: 'v1',
            auth,
        });
    }

    private createRawMessage(
        senderEmail: string,
        recipientEmail: string,
        fullName: string,
        verificationUrl: string,
    ): string {
        const subject = 'Xác nhận email tài khoản Course Management';

        return [
            `From: Course Management <${senderEmail}>`,
            `To: ${recipientEmail}`,
            `Subject: ${this.encodeMimeHeader(subject)}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            this.renderHtml(fullName, verificationUrl),
        ].join('\r\n');
    }

    private encodeMimeHeader(value: string): string {
        return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
    }

    private buildVerificationUrl(rawToken: string): string {
        const frontendUrl =
            this.configService
                .get<string>('FRONTEND_URL')
                ?.split(',')[0]
                .trim() || 'http://localhost:3000';

        const url = new URL('/verify-email', frontendUrl);
        url.searchParams.set('token', rawToken);

        return url.toString();
    }

    private renderHtml(fullName: string, verificationUrl: string): string {
        const safeFullName = this.escapeHtml(fullName);
        const safeVerificationUrl = this.escapeHtml(verificationUrl);

        return `
            <div style="font-family: Arial, sans-serif; line-height: 1.6">
                <h2>Xác nhận email</h2>
                <p>Xin chào ${safeFullName},</p>
                <p>
                    Vui lòng nhấn vào nút bên dưới để xác nhận email tài khoản.
                </p>
                <p>
                    <a
                        href="${safeVerificationUrl}"
                        style="
                            display: inline-block;
                            padding: 10px 16px;
                            background: #2563eb;
                            color: white;
                            text-decoration: none;
                            border-radius: 6px;
                        "
                    >
                        Xác nhận email
                    </a>
                </p>
                <p>Nếu bạn không tạo tài khoản, có thể bỏ qua email này.</p>
            </div>
        `;
    }

    private escapeHtml(value: string): string {
        return value.replace(
            /[&<>"']/g,
            (character) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;',
                })[character] ?? character,
        );
    }

    private isValidEmail(value: string): boolean {
        return /^[^@\s<>]+@[^@\s<>]+$/.test(value);
    }
}
