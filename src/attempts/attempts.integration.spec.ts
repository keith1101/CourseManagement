/*
 * These tests intentionally require an explicit isolated PostgreSQL URL.
 * They must never inherit the development/cloud-proxy database implicitly.
 *
 * PowerShell example:
 *   $env:TEST_DATABASE_URL = 'postgresql://.../course_management_test?schema=public'
 *   $env:DATABASE_URL = $env:TEST_DATABASE_URL
 *   pnpm db:deploy
 *   pnpm test:integration
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  AccessLevel,
  AnswerValueType,
  AttemptQuestionStatus,
  AttemptStatus,
  ExamStatus,
  QuestionType,
  UserRole,
} from '../../generated/client/enums';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const describeIntegration = testDatabaseUrl ? describe : describe.skip;

describeIntegration('sequential attempt API (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentToken: string;
  let adminToken: string;
  let studentId: string;
  let adminId: string;
  let subjectId: string;
  let examId: string;
  const questionIds: string[] = [];
  const attemptIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createAttempt = async (selectedQuestionIds = questionIds) => {
    const startedAt = new Date();
    const attemptId = randomUUID();
    const progressIds = selectedQuestionIds.map(() => randomUUID());
    await prisma.examAttempt.create({
      data: {
        id: attemptId,
        userId: studentId,
        examId,
        status: AttemptStatus.IN_PROGRESS,
        totalQuestions: selectedQuestionIds.length,
        flowVersion: 2,
        progressVersion: 0,
        startedAt,
      },
    });
    await prisma.attemptQuestionProgress.createMany({
      data: selectedQuestionIds.map((questionId, index) => ({
        id: progressIds[index],
        attemptId,
        questionId,
        ordinal: index,
        timeLimitSeconds: 20,
        status: index === 0 ? AttemptQuestionStatus.ACTIVE : AttemptQuestionStatus.LOCKED,
        activatedAt: index === 0 ? startedAt : null,
        deadlineAt: index === 0 ? new Date(startedAt.getTime() + 20_000) : null,
      })),
    });
    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { currentAttemptQuestionId: progressIds[0] },
    });
    attemptIds.push(attemptId);
    return { id: attemptId, progressIds };
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);

    const suffix = randomUUID();
    const student = await prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: 'Sequential Test Student',
        email: `sequential-student-${suffix}@example.test`,
        passwordHash: 'integration-test-only',
        role: UserRole.STUDENT,
        accessLevel: AccessLevel.FREE,
      },
    });
    const admin = await prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: 'Sequential Test Admin',
        email: `sequential-admin-${suffix}@example.test`,
        passwordHash: 'integration-test-only',
        role: UserRole.ADMIN,
        accessLevel: AccessLevel.PRO,
      },
    });
    studentId = student.id;
    adminId = admin.id;
    studentToken = await jwt.signAsync({
      sub: student.id,
      email: student.email,
      role: UserRole.STUDENT,
      tokenVersion: student.tokenVersion,
    });
    adminToken = await jwt.signAsync({
      sub: admin.id,
      email: admin.email,
      role: UserRole.ADMIN,
      tokenVersion: admin.tokenVersion,
    });

    const subject = await prisma.subject.create({
      data: {
        id: randomUUID(),
        code: `SEQ-${suffix.slice(0, 8)}`,
        name: 'Sequential test subject',
        displayOrder: 0,
      },
    });
    subjectId = subject.id;
    const exam = await prisma.exam.create({
      data: {
        id: randomUUID(),
        title: 'Sequential API test exam',
        status: ExamStatus.PUBLISHED,
        accessLevel: AccessLevel.FREE,
      },
    });
    examId = exam.id;

    const first = await prisma.question.create({
      data: {
        id: randomUUID(),
        examId,
        subjectId,
        questionType: QuestionType.MULTIPLE_CHOICE,
        contentText: 'Select the correct option.',
        hint: 'Read the definition.',
        explaination: 'The first option is the canonical answer.',
        timeLimitSeconds: 20,
        position: 0,
        questionOptions: {
          create: [
            { id: randomUUID(), contentText: 'Correct option', position: 0, isCorrect: true },
            { id: randomUUID(), contentText: 'Incorrect option', position: 1, isCorrect: false },
          ],
        },
      },
      include: { questionOptions: true },
    });
    const second = await prisma.question.create({
      data: {
        id: randomUUID(),
        examId,
        subjectId,
        questionType: QuestionType.SHORT_ANSWER,
        contentText: 'Name the capital of Thailand.',
        correctTextAnswer: 'Bangkok',
        hint: 'It starts with B.',
        explaination: 'Bangkok is the capital of Thailand.',
        timeLimitSeconds: 20,
        position: 1,
        questionAcceptedAnswers: {
          create: [{
            id: randomUUID(),
            answerType: AnswerValueType.TEXT,
            rawValue: 'Bangkok',
            normalizedText: 'bangkok',
            isPrimary: true,
            isCorrect: true,
            position: 0,
          }],
        },
      },
    });
    const third = await prisma.question.create({
      data: {
        id: randomUUID(),
        examId,
        subjectId,
        questionType: QuestionType.MULTIPLE_CHOICE,
        contentText: 'Final test question.',
        hint: 'Choose one.',
        explaination: 'The first option is correct.',
        timeLimitSeconds: 20,
        position: 2,
        questionOptions: {
          create: [
            { id: randomUUID(), contentText: 'Final correct', position: 0, isCorrect: true },
            { id: randomUUID(), contentText: 'Final wrong', position: 1, isCorrect: false },
          ],
        },
      },
      include: { questionOptions: true },
    });
    questionIds.push(first.id, second.id, third.id);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.examAttempt.updateMany({
      where: { id: { in: attemptIds } },
      data: { currentAttemptQuestionId: null },
    });
    await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.attemptQuestionProgress.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.examAttempt.deleteMany({ where: { id: { in: attemptIds } } });
    await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionAcceptedAnswer.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId] } } });
    await app.close();
  });

  it('requires authentication and student role for sequential mutations', async () => {
    const attempt = await createAttempt();
    const unauthenticated = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set('Idempotency-Key', 'auth-test')
      .send({ questionId: questionIds[0], progressVersion: 0, selectedOptionId: 'invalid' });
    expect(unauthenticated.status).toBe(401);

    const adminResponse = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(adminToken))
      .set('Idempotency-Key', 'admin-test')
      .send({ questionId: questionIds[0], progressVersion: 0, selectedOptionId: 'invalid' });
    expect(adminResponse.status).toBe(403);
  });

  it('rejects missing idempotency keys and invalid option ids', async () => {
    const attempt = await createAttempt();
    const missingKey = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .send({ questionId: questionIds[0], progressVersion: 0, selectedOptionId: 'invalid' });
    expect(missingKey.status).toBe(400);

    const invalidOption = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'invalid-option')
      .send({ questionId: questionIds[0], progressVersion: 0, selectedOptionId: 'invalid' });
    expect(invalidOption.status).toBe(400);
  });

  it('grades a correct answer, keeps the question current for three seconds, then advances', async () => {
    const attempt = await createAttempt();
    const session = await request(app.getHttpServer())
      .get(`/api/attempts/${attempt.id}/session`)
      .set(auth(studentToken));
    expect(session.status).toBe(200);
    const correctOptionId = session.body.currentQuestion.question.questionOptions[0].id;

    const submitted = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'correct-flow')
      .send({
        questionId: questionIds[0],
        progressVersion: session.body.progressVersion,
        selectedOptionId: correctOptionId,
      });
    expect(submitted.status).toBe(201);
    expect(submitted.body).toEqual(expect.objectContaining({ status: 'CORRECT', isCorrect: true }));
    expect(submitted.body.advanceAfter).toBeTruthy();

    const duringFeedback = await request(app.getHttpServer())
      .get(`/api/attempts/${attempt.id}/session`)
      .set(auth(studentToken));
    expect(duringFeedback.body.currentQuestion.id).toBe(questionIds[0]);
    expect(duringFeedback.body.currentQuestion.status).toBe('CORRECT');

    await new Promise((resolve) => setTimeout(resolve, 3_100));
    const continued = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/continue`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'correct-continue')
      .send({ questionId: questionIds[0], progressVersion: submitted.body.progressVersion });
    expect(continued.status).toBe(201);
    expect(continued.body.currentQuestion.id).toBe(questionIds[1]);
    expect(continued.body.navigator[0].status).toBe('COMPLETED');
  });

  it('follows the incorrect path and ignores client navigation hints', async () => {
    const attempt = await createAttempt();
    const submitted = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'incorrect-flow')
      .send({
        questionId: questionIds[0],
        progressVersion: 0,
        selectedOptionId: 'not-a-real-option',
        questionIndex: 99,
        currentQuestion: questionIds[2],
      });
    // The invalid option is still rejected; navigation hints cannot change
    // which server-owned question is evaluated.
    expect(submitted.status).toBe(400);

    const wrongOption = await prisma.questionOption.findFirst({
      where: { questionId: questionIds[0], isCorrect: false },
      select: { id: true },
    });
    const graded = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'incorrect-flow-valid')
      .send({
        questionId: questionIds[0],
        progressVersion: 0,
        selectedOptionId: wrongOption?.id,
        questionIndex: 99,
        currentQuestion: questionIds[2],
      });
    expect(graded.status).toBe(201);
    expect(graded.body.status).toBe('INCORRECT');
    expect(graded.body.feedback).toEqual(expect.objectContaining({
      correctAnswer: expect.any(Object),
      guidance: expect.any(Object),
      explanation: expect.any(Object),
    }));

    const continued = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/continue`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'incorrect-continue')
      .send({
        questionId: questionIds[0],
        progressVersion: graded.body.progressVersion,
        questionIndex: 0,
        currentQuestion: questionIds[0],
      });
    expect(continued.status).toBe(201);
    expect(continued.body.currentQuestion.id).toBe(questionIds[1]);
  });

  it('persists timeout feedback and requires Continue, including on the final question', async () => {
    const attempt = await createAttempt([questionIds[0]]);
    await prisma.attemptQuestionProgress.updateMany({
      where: { attemptId: attempt.id },
      data: { deadlineAt: new Date(Date.now() - 1_000) },
    });
    const expired = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/expire`)
      .set(auth(studentToken));
    expect(expired.status).toBe(201);
    expect(expired.body.currentQuestion.status).toBe('TIMED_OUT');
    expect(expired.body.currentQuestion.feedback).toEqual(expect.objectContaining({
      timedOut: true,
      guidance: expect.any(Object),
      explanation: expect.any(Object),
    }));

    const completed = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/continue`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'timeout-final-continue')
      .send({ questionId: questionIds[0], progressVersion: expired.body.progressVersion });
    expect(completed.status).toBe(201);
    expect(completed.body.attemptStatus).toBe('COMPLETED');
    expect(completed.body.currentQuestion).toBeNull();
  });

  it('treats a deadline that has already been reached as TIMED_OUT at submit time', async () => {
    const attempt = await createAttempt();
    const option = await prisma.questionOption.findFirst({
      where: { questionId: questionIds[0] },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    await prisma.attemptQuestionProgress.updateMany({
      where: { attemptId: attempt.id },
      data: { deadlineAt: new Date() },
    });
    const response = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken))
      .set('Idempotency-Key', 'timeout-at-submit')
      .send({
        questionId: questionIds[0],
        progressVersion: 0,
        selectedOptionId: option?.id,
      });
    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'TIMED_OUT',
      timedOut: true,
      advanceAfter: null,
    }));
  });

  it('replays an idempotent submission and rejects locked or stale progress', async () => {
    const attempt = await createAttempt();
    const wrongOption = await prisma.questionOption.findFirst({
      where: { questionId: questionIds[0], isCorrect: false },
      select: { id: true },
    });
    const payload = { questionId: questionIds[0], progressVersion: 0, selectedOptionId: wrongOption?.id };
    const first = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken)).set('Idempotency-Key', 'replay-key').send(payload);
    const replay = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken)).set('Idempotency-Key', 'replay-key').send(payload);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.status).toBe('INCORRECT');
    expect(replay.body.feedback).toEqual(expect.objectContaining({
      correctAnswer: expect.any(Object),
      guidance: expect.any(Object),
      explanation: expect.any(Object),
    }));
    expect(await prisma.attemptAnswer.count({ where: { attemptId: attempt.id } })).toBe(1);

    const locked = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/current-question/submit`)
      .set(auth(studentToken)).set('Idempotency-Key', 'locked-key')
      .send({ questionId: questionIds[1], progressVersion: first.body.progressVersion, rawValue: 'Bangkok' });
    expect(locked.status).toBe(409);
    expect(locked.body.code ?? locked.body.message).toBeDefined();
  });

  it('allows only one of two concurrent submissions to commit', async () => {
    const attempt = await createAttempt();
    const options = await prisma.questionOption.findMany({
      where: { questionId: questionIds[0] }, orderBy: { position: 'asc' }, select: { id: true },
    });
    const responses = await Promise.all(options.slice(0, 2).map((option, index) =>
      request(app.getHttpServer())
        .post(`/api/attempts/${attempt.id}/current-question/submit`)
        .set(auth(studentToken)).set('Idempotency-Key', `concurrent-${index}`)
        .send({ questionId: questionIds[0], progressVersion: 0, selectedOptionId: option.id }),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.every((response) => response.status !== 500)).toBe(true);
    expect(await prisma.attemptAnswer.count({ where: { attemptId: attempt.id } })).toBe(1);
  });

  it('rejects the legacy full-exam submit endpoint for v2 attempts and does not mutate completion', async () => {
    const attempt = await createAttempt();
    const response = await request(app.getHttpServer())
      .post(`/api/attempts/${attempt.id}/submit`)
      .set(auth(studentToken));
    expect(response.status).toBe(409);
    const persisted = await prisma.examAttempt.findUnique({ where: { id: attempt.id } });
    expect(persisted?.status).toBe(AttemptStatus.IN_PROGRESS);
  });

  it('does not expose the complete question collection to a v2 student attempt', async () => {
    await createAttempt();
    const response = await request(app.getHttpServer())
      .get(`/api/exams/${examId}/questions`)
      .set(auth(studentToken));
    expect([403, 404]).toContain(response.status);
  });
});
