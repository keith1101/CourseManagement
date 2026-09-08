jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(),
    },
    gmail: jest.fn(),
  },
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const mockedGoogle = jest.requireMock('googleapis').google as {
  auth: { OAuth2: jest.Mock };
  gmail: jest.Mock;
};
const mockSend = jest.fn();
const mockOAuth2 = mockedGoogle.auth.OAuth2;
const mockGmail = mockedGoogle.gmail;

describe('EmailService', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    mockSend.mockReset();
    mockOAuth2.mockReset();
    mockGmail.mockReset();

    mockOAuth2.mockImplementation(() => ({
      setCredentials: jest.fn(),
    }));
    mockGmail.mockImplementation(() => ({
      users: {
        messages: {
          send: mockSend,
        },
      },
    }));
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('logs the verification link in console mode during development', async () => {
    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'console',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation();

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).resolves.toEqual({ provider: 'console' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'http://localhost:3000/verify-email?token=raw-token',
      ),
    );
  });

  it('rejects console delivery in production', async () => {
    process.env.NODE_ENV = 'production';

    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'console',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not auto-select Gmail when only part of the configuration is present', async () => {
    const service = new EmailService(
      new ConfigService({
        GMAIL_SENDER_EMAIL: 'sender@gmail.com',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation();

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).resolves.toEqual({ provider: 'console' });

    expect(warnSpy).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects Gmail delivery when OAuth credentials are missing', async () => {
    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'gmail',
        FRONTEND_URL: 'http://localhost:3000',
        GMAIL_SENDER_EMAIL: 'sender@gmail.com',
      }),
    );

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects a malformed Gmail sender address before calling the API', async () => {
    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'gmail',
        GMAIL_CLIENT_ID: 'client-id',
        GMAIL_CLIENT_SECRET: 'client-secret',
        GMAIL_REFRESH_TOKEN: 'refresh-token',
        GMAIL_SENDER_EMAIL: 'sender@gmail.com>',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).rejects.toThrow('GMAIL_SENDER_EMAIL must be a valid email address');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends a verification email through Gmail API', async () => {
    mockSend.mockResolvedValue({
      data: {
        id: 'gmail-message-id',
      },
    });

    const setCredentials = jest.fn();
    mockOAuth2.mockImplementation(() => ({ setCredentials }));

    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'gmail',
        GMAIL_CLIENT_ID: 'client-id',
        GMAIL_CLIENT_SECRET: 'client-secret',
        GMAIL_REDIRECT_URI: 'http://localhost:5001/api/auth/google/callback',
        GMAIL_REFRESH_TOKEN: 'refresh-token',
        GMAIL_SENDER_EMAIL: 'sender@gmail.com',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).resolves.toEqual({
      provider: 'gmail',
      messageId: 'gmail-message-id',
    });

    expect(mockOAuth2).toHaveBeenCalledWith(
      'client-id',
      'client-secret',
      'http://localhost:5001/api/auth/google/callback',
    );
    expect(setCredentials).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect(mockSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        raw: expect.any(String),
      },
    });

    const rawMessage = Buffer.from(
      mockSend.mock.calls[0][0].requestBody.raw,
      'base64url',
    ).toString('utf8');

    expect(rawMessage).toContain('To: student@example.com');
    expect(rawMessage).toContain('Subject: =?UTF-8?B?');
    expect(rawMessage).toContain('<h2>Xác nhận email</h2>');
    expect(rawMessage).toContain(
      'http://localhost:3000/verify-email?token=raw-token',
    );
  });

  it('maps Gmail API failures to a service unavailable error', async () => {
    mockSend.mockRejectedValue(new Error('gmail failure'));

    const service = new EmailService(
      new ConfigService({
        EMAIL_PROVIDER: 'gmail',
        GMAIL_CLIENT_ID: 'client-id',
        GMAIL_CLIENT_SECRET: 'client-secret',
        GMAIL_REFRESH_TOKEN: 'refresh-token',
        GMAIL_SENDER_EMAIL: 'sender@gmail.com',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );

    await expect(
      service.sendVerificationEmail({
        to: 'student@example.com',
        fullName: 'Nguyen Van A',
        rawToken: 'raw-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
