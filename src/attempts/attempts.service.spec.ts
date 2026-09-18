import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerValueType,
  AttemptStatus,
  QuestionType,
} from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptsService } from './attempts.service';

const FORBIDDEN_STUDENT_KEYS = new Set([
  'correctTextAnswer',
  'questionAcceptedAnswers',
  'acceptedAnswers',
  'isCorrect',
  'correctOptionId',
  'correctOptionIds',
  'correctAnswer',
  'correctAnswers',
  'answerKey',
  'gradingKey',
  'explaination',
  'explanation',
  'explanationImageUrl',
  'explanationImageStorageUri',
]);

function forbiddenStudentKeys(
  value: unknown,
  path = 'root',
  allowCompletedResultCorrectness = false,
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenStudentKeys(
      item,
      `${path}[${index}]`,
      allowCompletedResultCorrectness,
    ));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => [
    ...(FORBIDDEN_STUDENT_KEYS.has(key)
      && !(
        allowCompletedResultCorrectness
        && key === 'isCorrect'
        && /^root\.attemptedAnswers\[\d+\]\.isCorrect$/.test(`${path}.${key}`)
      )
      ? [`${path}.${key}`]
      : []),
    ...forbiddenStudentKeys(nestedValue, `${path}.${key}`, allowCompletedResultCorrectness),
  ]);
}

const questionWithAnswerData = {
  id: 'question-1',
  examId: 'exam-1',
  subjectId: 'subject-1',
  questionType: QuestionType.MULTIPLE_CHOICE,
  contentText: 'Question',
  imageUrl: null,
  hintImageUrl: null,
  hint: 'A safe hint',
  instruction: null,
  timeLimitSeconds: 30,
  position: 0,
  correctTextAnswer: 'Paris',
  explaination: 'The answer is Paris',
  explanationImageUrl: 'gs://bucket/explanation.png',
  questionOptions: [
    { id: 'correct-option', contentText: 'A', imageUrl: null, isCorrect: true, position: 0 },
    { id: 'wrong-option', contentText: 'B', imageUrl: null, isCorrect: false, position: 1 },
  ],
  questionAcceptedAnswers: [
    { id: 'accepted-1', rawValue: 'Paris', answerType: AnswerValueType.TEXT, isCorrect: true, position: 0 },
  ],
};

function makeCompletedAttemptAnswer({
  id,
  questionId = 'question-1',
  answerType = AnswerValueType.TEXT,
  selectedOptionId = null,
  rawValue = 'answer',
  numericValue = null,
  isCorrect,
}: {
  id: string;
  questionId?: string;
  answerType?: AnswerValueType;
  selectedOptionId?: string | null;
  rawValue?: string;
  numericValue?: number | null;
  isCorrect: boolean;
}) {
  return {
    id,
    attemptId: 'attempt-1',
    questionId,
    selectedOptionId,
    answerType,
    rawValue,
    normalizedText: rawValue.toLocaleLowerCase(),
    content: null,
    numericValue,
    position: Number(id.replace(/\D/g, '')) || 0,
    isCorrect,
  };
}

describe('AttemptsService', () => {
  let service: AttemptsService;
  let prisma: any;
  let gcsStorage: any;

  beforeEach(() => {
    prisma = {
      exam: { findUnique: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      examAssignment: { findUnique: jest.fn(), findFirst: jest.fn() },
      examAttempt: {
        findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
        update: jest.fn(), findMany: jest.fn(),
      },
      attemptQuestionProgress: {
        findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
        createMany: jest.fn(), update: jest.fn(), count: jest.fn(),
      },
      question: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      questionPart: { findMany: jest.fn().mockResolvedValue([]) },
      questionOption: { findMany: jest.fn() },
      questionAcceptedAnswer: { findMany: jest.fn() },
      attemptAnswer: {
        findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback({
        attemptAnswer: { update: jest.fn() },
        examAttempt: { update: jest.fn() },
      })),
    };
    gcsStorage = {
      resolveReadUrl: jest.fn(async (storageUri: string | null | undefined) => ({
        url: storageUri,
        storageUri: storageUri?.startsWith('gs://') ? storageUri : undefined,
      })),
    };
    service = new AttemptsService(prisma as PrismaService, gcsStorage);
  });

  const arrangeCompletedResult = (
    attemptedAnswers: unknown[],
    correctCount: number,
  ) => {
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'attempt-1',
        userId: 'student-1',
        examId: 'exam-1',
        status: AttemptStatus.COMPLETED,
        exam: { deletedAt: null },
      })
      .mockResolvedValueOnce({
        id: 'attempt-1',
        userId: 'student-1',
        examId: 'exam-1',
        status: AttemptStatus.COMPLETED,
        submittedAt: new Date(),
        correctCount,
        totalQuestions: attemptedAnswers.length,
        exam: { id: 'exam-1', title: 'Exam' },
        attemptedAnswers,
      });

    prisma.question.findMany.mockResolvedValue([]);
  };

  it('starts an attempt for a published free exam with an active assignment', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', status: 'PUBLISHED', title: 'Exam', accessLevel: 'FREE',
    });
    prisma.user.findUnique.mockResolvedValue({ accessLevel: 'FREE', proExpiresAt: null });
    prisma.examAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      dueAt: new Date(Date.now() + 60_000),
    });
    prisma.examAttempt.findFirst.mockResolvedValue(null);
    prisma.question.findMany
      .mockResolvedValueOnce([
        { questionType: QuestionType.MULTIPLE_CHOICE, questionParts: [] },
      ])
      .mockResolvedValueOnce([]);
    prisma.examAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({ id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS })
      .mockResolvedValueOnce({ id: 'attempt-1', examId: 'exam-1', attemptedAnswers: [] });
    prisma.question.findMany.mockResolvedValue([]);

    const result = await service.start('exam-1', 'student-1', {});

    expect(prisma.examAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'student-1',
          examId: 'exam-1',
          assignmentId: 'assignment-1',
          totalQuestions: 1,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'attempt-1', questions: [] }));
  });

  it('retries PostgreSQL serialization failures reported by the Prisma adapter', async () => {
    const transactionCallback = jest.fn(async () => ({ ok: true }));
    prisma.$transaction
      .mockRejectedValueOnce({
        cause: {
          originalCode: '40001',
          kind: 'TransactionWriteConflict',
        },
      })
      .mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) =>
        callback({}),
      );

    await expect(
      (service as any).runSequentialTransaction(transactionCallback),
    ).resolves.toEqual({ ok: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transactionCallback).toHaveBeenCalledTimes(1);
  });

  it('serializes sequential mutations on the owning attempt row', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const transaction: any = {
      $queryRaw: queryRaw,
      examAttempt: { findUnique: jest.fn() },
      attemptQuestionProgress: { findUnique: jest.fn() },
      attemptAnswer: { findFirst: jest.fn() },
    };
    transaction.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      userId: 'student-1',
      examId: 'exam-1',
      status: AttemptStatus.IN_PROGRESS,
      flowVersion: 2,
      progressVersion: 0,
      currentAttemptQuestionId: null,
    });

    prisma.$transaction.mockImplementation(
      async (callback: (tx: any) => Promise<unknown>, options: any) => {
        expect(options).toEqual(expect.objectContaining({ isolationLevel: 'ReadCommitted' }));
        return callback(transaction);
      },
    );

    await expect(
      (service as any).runSequentialTransaction((tx: any) =>
        (service as any).getSequentialMutationState(tx, 'attempt-1', 'student-1'),
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'attempt-1' }));

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
  });

  it.each([
    ['Prisma P2034', { code: 'P2034' }],
    ['Prisma idempotency unique race', { code: 'P2002' }],
    ['pg serialization code', { cause: { originalCode: '40001' } }],
    ['pg deadlock code', { cause: { originalCode: '40P01' } }],
    ['Prisma adapter transaction conflict', { cause: { kind: 'TransactionWriteConflict' } }],
  ])('recognizes %s as a retryable sequential transaction failure', (_label, failure) => {
    expect((service as any).isSequentialSerializationFailure(failure)).toBe(true);
  });

  it('converts exhausted serialization retries into a safe conflict instead of HTTP 500', async () => {
    prisma.$transaction.mockRejectedValue({
      cause: { originalCode: '40001', kind: 'TransactionWriteConflict' },
    });

    await expect(
      (service as any).runSequentialTransaction(async () => ({ ok: true })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('uses the exact deadline boundary for timeout grading', async () => {
    const deadline = new Date('2026-09-11T04:00:00.000Z');
    const transaction: any = {
      examAttempt: { findUnique: jest.fn(), update: jest.fn() },
      attemptQuestionProgress: {
        findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn(), count: jest.fn(),
      },
      attemptAnswer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    };
    transaction.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1',
      status: AttemptStatus.IN_PROGRESS, flowVersion: 2, progressVersion: 0,
      currentAttemptQuestionId: 'progress-1',
    });
    transaction.attemptQuestionProgress.findUnique.mockResolvedValue({
      id: 'progress-1', attemptId: 'attempt-1', questionId: 'question-1', ordinal: 0,
      status: 'ACTIVE', timeLimitSeconds: 30, activatedAt: new Date(deadline.getTime() - 30_000),
      deadlineAt: deadline, submittedAt: null, advanceAfter: null, completedAt: null,
      isCorrect: null, timedOut: false, lastAdvanceKey: null,
    });
    transaction.attemptAnswer.create.mockResolvedValue({ id: 'answer-1' });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(transaction));
    jest.spyOn(service as any, 'getSequentialQuestionForEvaluation').mockResolvedValue(questionWithAnswerData);
    jest.spyOn(service as any, 'getSequentialFeedback').mockResolvedValue({
      questionId: 'question-1', isCorrect: false, timedOut: true,
    });

    const result = await service.submitSequentialAnswer(
      'attempt-1',
      'student-1',
      { questionId: 'question-1', progressVersion: 0, selectedOptionId: 'correct-option' },
      'deadline-key',
      deadline,
    );

    expect(result).toEqual(expect.objectContaining({
      status: 'TIMED_OUT',
      timedOut: true,
      isCorrect: false,
      advanceAfter: null,
    }));
    expect(transaction.attemptQuestionProgress.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TIMED_OUT', timedOut: true, advanceAfter: null }),
    }));
    expect(transaction.attemptAnswer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ timedOut: true, submittedAt: deadline, submissionKey: 'deadline-key' }),
    }));
  });

  it('transitions a correct question to the next active question only after completion', async () => {
    const transaction: any = {
      attemptQuestionProgress: {
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'progress-2', timeLimitSeconds: 20 }),
      },
      examAttempt: { update: jest.fn() },
    };
    const now = new Date('2026-09-11T04:00:00.000Z');

    await (service as any).completeSequentialCurrent(
      transaction,
      { id: 'attempt-1', current: { id: 'progress-1', ordinal: 0 } },
      now,
      'continue-key',
    );

    expect(transaction.attemptQuestionProgress.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'progress-1' },
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: now, lastAdvanceKey: 'continue-key' }),
    }));
    expect(transaction.attemptQuestionProgress.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'progress-2' },
      data: expect.objectContaining({ status: 'ACTIVE', activatedAt: now }),
    }));
    expect(transaction.examAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentAttemptQuestionId: 'progress-2', progressVersion: { increment: 1 } }),
    }));
  });

  it('starts an unassigned published free exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', status: 'PUBLISHED', title: 'Exam', accessLevel: 'FREE',
    });
    prisma.user.findUnique.mockResolvedValue({ accessLevel: 'FREE', proExpiresAt: null });
    prisma.examAssignment.findFirst.mockResolvedValue(null);
    prisma.examAttempt.findFirst.mockResolvedValue(null);
    prisma.question.findMany
      .mockResolvedValueOnce([
        { questionType: QuestionType.MULTIPLE_CHOICE, questionParts: [] },
      ])
      .mockResolvedValueOnce([]);
    prisma.examAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({ id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS })
      .mockResolvedValueOnce({ id: 'attempt-1', examId: 'exam-1', attemptedAnswers: [] });

    await expect(service.start('exam-1', 'student-1', {})).resolves.toEqual(
      expect.objectContaining({ id: 'attempt-1', questions: [] }),
    );
    expect(prisma.examAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignmentId: undefined, totalQuestions: 1 }),
      }),
    );
  });

  it('includes student identity when listing attempts', async () => {
    const attempts = [
      {
        id: 'attempt-1',
        userId: 'student-1',
        user: { id: 'student-1', fullName: 'Nguyen Van A', email: 'student@example.com' },
        exam: { id: 'exam-1', title: 'Exam', status: 'PUBLISHED' },
      },
    ];
    prisma.examAttempt.findMany.mockResolvedValue(attempts);

    await expect(service.findAll({} as any)).resolves.toBe(attempts);
    expect(prisma.examAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          user: {
            select: { id: true, fullName: true, email: true },
          },
        }),
      }),
    );
  });

  it('allows a short answer with selectedOptionId set to null', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1', position: 0, questionType: QuestionType.SHORT_ANSWER,
      correctTextAnswer: 'Paris', explaination: null, questionOptions: [], questionAcceptedAnswers: [],
    });
    prisma.attemptAnswer.findFirst.mockResolvedValue(null);
    prisma.attemptAnswer.create.mockResolvedValue({
      id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1', selectedOptionId: null,
      answerType: AnswerValueType.TEXT, rawValue: 'Paris', normalizedText: 'paris', content: null,
      position: 0, numericValue: null, isCorrect: true,
    });

    const result = await service.saveAnswer('attempt-1', 'student-1', {
      questionId: 'question-1', rawValue: 'Paris', finalize: true,
    });

    expect(prisma.attemptAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ selectedOptionId: null, answerType: AnswerValueType.TEXT }),
    });
    expect(result.selectedOptionId).toBeNull();
    expect(result).not.toHaveProperty('isCorrect');
  });

  it('rejects an unsubmitted answer', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1', position: 0, questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null, explaination: 'Because this is correct.',
      explanationImageUrl: 'gs://bucket/explanation.png',
      questionOptions: [
        { id: 'valid-option', contentText: 'A', isCorrect: true },
        { id: 'other-option', contentText: 'B', isCorrect: false },
      ],
      questionAcceptedAnswers: [],
    });
    await expect(service.saveAnswer('attempt-1', 'student-1', {
      questionId: 'question-1', selectedOptionId: 'valid-option',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attemptAnswer.create).not.toHaveBeenCalled();
  });

  it('rejects a multiple-choice option belonging to another question', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1', position: 0, questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null, explaination: null,
      questionOptions: [{ id: 'valid-option', contentText: 'A', isCorrect: true }],
      questionAcceptedAnswers: [],
    });

    await expect(service.saveAnswer('attempt-1', 'student-1', {
      questionId: 'question-1', selectedOptionId: 'option-from-other-question',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attemptAnswer.create).not.toHaveBeenCalled();
  });

  it('stores a timed-out unanswered multiple-choice question without an invalid option id', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1', position: 0, questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null, explaination: null, questionOptions: [
        { id: 'valid-option', contentText: 'A', isCorrect: true },
      ], questionAcceptedAnswers: [],
    });
    prisma.attemptAnswer.findFirst.mockResolvedValue(null);
    prisma.attemptAnswer.create.mockResolvedValue({
      id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1', selectedOptionId: null,
      answerType: AnswerValueType.TEXT, rawValue: '', normalizedText: '', content: null,
      position: 0, numericValue: null, isCorrect: false,
    });

    const result = await service.saveAnswer('attempt-1', 'student-1', {
      questionId: 'question-1', selectedOptionId: '', timedOut: true,
    });

    expect(prisma.attemptAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ selectedOptionId: null, rawValue: '' }),
    });
    expect(result.selectedOptionId).toBeNull();
    expect(result.timedOut).toBe(true);
  });

  it('does not expose answer keys while loading an in-progress attempt', async () => {
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
        exam: { deletedAt: null },
      })
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', assignmentId: 'assignment-1',
        status: AttemptStatus.IN_PROGRESS, submittedAt: null, correctCount: 0, totalQuestions: 1,
        startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        user: { id: 'student-1', fullName: 'Student', email: 'student@example.com' },
        exam: { id: 'exam-1', title: 'Exam', status: 'PUBLISHED' },
        assignment: { id: 'assignment-1', assignedAt: new Date(), dueAt: new Date(Date.now() + 60_000) },
        attemptedAnswers: [{
          id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1',
          selectedOptionId: 'correct-option', answerType: AnswerValueType.TEXT,
          rawValue: 'A', normalizedText: 'a', content: null, numericValue: null,
          position: 0, isCorrect: true,
          question: questionWithAnswerData,
          selectedOption: { id: 'correct-option', contentText: 'A', imageUrl: null, position: 0, isCorrect: true },
        }],
      });

    const result = await service.findOne('attempt-1', 'student-1');

    expect(forbiddenStudentKeys(result)).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      status: AttemptStatus.IN_PROGRESS,
      attemptedAnswers: [expect.objectContaining({
        selectedOptionId: 'correct-option',
        question: expect.objectContaining({ questionType: QuestionType.MULTIPLE_CHOICE }),
      })],
    }));
    expect(prisma.examAttempt.findUnique.mock.calls[1][0].select.attemptedAnswers.select)
      .not.toHaveProperty('isCorrect');
  });

  it('keeps assignment-started attempt questions free of answer keys', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', status: 'PUBLISHED', title: 'Exam', accessLevel: 'FREE',
    });
    prisma.user.findUnique.mockResolvedValue({ accessLevel: 'FREE', proExpiresAt: null });
    prisma.examAssignment.findUnique.mockResolvedValue({
      id: 'assignment-1', userId: 'student-1', examId: 'exam-1', deletedAt: null,
      dueAt: new Date(Date.now() + 60_000),
    });
    prisma.examAttempt.findFirst.mockResolvedValue(null);
    prisma.question.count.mockResolvedValue(1);
    prisma.examAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
        exam: { deletedAt: null },
      })
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', assignmentId: 'assignment-1',
        status: AttemptStatus.IN_PROGRESS, submittedAt: null, correctCount: 0, totalQuestions: 1,
        startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        user: { id: 'student-1', fullName: 'Student', email: 'student@example.com' },
        exam: { id: 'exam-1', title: 'Exam', status: 'PUBLISHED' },
        assignment: { id: 'assignment-1', assignedAt: new Date(), dueAt: new Date(Date.now() + 60_000) },
        attemptedAnswers: [],
      });
    prisma.question.findMany.mockResolvedValue([questionWithAnswerData]);

    const result = await service.start('exam-1', 'student-1', { assignmentId: 'assignment-1' });

    expect(forbiddenStudentKeys(result)).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('uses least disclosure for completed results', async () => {
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.COMPLETED,
        exam: { deletedAt: null },
      })
      .mockResolvedValueOnce({
        id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.COMPLETED,
        submittedAt: new Date(), correctCount: 1, totalQuestions: 1,
        exam: { id: 'exam-1', title: 'Exam' },
        attemptedAnswers: [{
          id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1',
          selectedOptionId: 'correct-option', answerType: AnswerValueType.TEXT,
          rawValue: 'A', normalizedText: 'a', content: null, numericValue: null,
          position: 0, isCorrect: true,
          question: questionWithAnswerData,
          selectedOption: { id: 'correct-option', contentText: 'A', imageUrl: null, position: 0, isCorrect: true },
        }],
      });
    prisma.question.findMany.mockResolvedValue([questionWithAnswerData]);

    const result = await service.getResult('attempt-1', 'student-1');

    expect(forbiddenStudentKeys(result, 'root', true)).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      correctCount: 1,
      totalQuestions: 1,
      percentage: 100,
      attemptedAnswers: [expect.objectContaining({ isCorrect: true })],
    }));
    expect(prisma.examAttempt.findUnique.mock.calls[1][0].select.attemptedAnswers.select)
      .toHaveProperty('isCorrect', true);
    expect(prisma.question.findMany.mock.calls[0][0].select).toBeDefined();
  });

  it.each([
    [
      'multiple-choice correct',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.TEXT,
        selectedOptionId: 'correct-option', isCorrect: true,
      }),
      1,
      true,
    ],
    [
      'multiple-choice incorrect',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.TEXT,
        selectedOptionId: 'wrong-option', isCorrect: false,
      }),
      0,
      false,
    ],
    [
      'short answer correct',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.TEXT,
        rawValue: 'Paris', isCorrect: true,
      }),
      1,
      true,
    ],
    [
      'short answer incorrect',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.TEXT,
        rawValue: 'London', isCorrect: false,
      }),
      0,
      false,
    ],
    [
      'numeric answer correct',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.NUMBER,
        rawValue: '100', numericValue: 100, isCorrect: true,
      }),
      1,
      true,
    ],
    [
      'numeric answer incorrect',
      makeCompletedAttemptAnswer({
        id: 'answer-1', answerType: AnswerValueType.NUMBER,
        rawValue: '99', numericValue: 99, isCorrect: false,
      }),
      0,
      false,
    ],
  ])('returns stored correctness for a completed %s', async (
    _label,
    answer,
    correctCount,
    expectedIsCorrect,
  ) => {
    arrangeCompletedResult([answer], correctCount as number);

    const result = await service.getResult('attempt-1', 'student-1');

    expect(result.attemptedAnswers).toEqual([
      expect.objectContaining({ isCorrect: expectedIsCorrect }),
    ]);
    const attemptedAnswers = result.attemptedAnswers as Array<{ isCorrect: boolean }>;
    expect(attemptedAnswers.filter((item) => item.isCorrect).length)
      .toBe(result.correctCount);
    expect(forbiddenStudentKeys(result, 'root', true)).toEqual([]);
  });

  it.each([
    ['two answers correct', [true, true], 2],
    ['one answer correct', [true, false], 1],
    ['no answers correct', [false, false], 0],
  ])('keeps aggregate and per-answer results consistent when %s', async (
    _label,
    correctness,
    correctCount,
  ) => {
    const answers = (correctness as boolean[]).map((isCorrect, index) =>
      makeCompletedAttemptAnswer({
        id: `answer-${index + 1}`,
        questionId: `question-${index + 1}`,
        isCorrect,
      }),
    );
    arrangeCompletedResult(answers, correctCount as number);

    const result = await service.getResult('attempt-1', 'student-1');
    const returnedAnswers = result.attemptedAnswers as Array<{ isCorrect: boolean }>;
    const perAnswerCorrectCount = returnedAnswers.filter(
      (answer) => answer.isCorrect,
    ).length;

    expect(result.correctCount).toBe(correctCount);
    expect(returnedAnswers.map((answer) => answer.isCorrect))
      .toEqual(correctness);
    expect(perAnswerCorrectCount).toBe(correctCount);
  });

  it('rejects a completed result with inconsistent persisted scoring', async () => {
    arrangeCompletedResult([
      makeCompletedAttemptAnswer({ id: 'answer-1', isCorrect: true }),
    ], 0);

    await expect(service.getResult('attempt-1', 'student-1')).rejects.toThrow(
      'Attempt result is inconsistent',
    );
  });

  it('enforces attempt ownership', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'owner', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });

    await expect(service.findOne('attempt-1', 'another-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the existing result when submit is called again', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.COMPLETED,
    });
    const result = { id: 'attempt-1', status: AttemptStatus.COMPLETED };
    jest.spyOn(service, 'getResult').mockResolvedValue(result as any);

    await expect(service.submit('attempt-1', 'student-1')).resolves.toBe(result);
    expect(service.getResult).toHaveBeenCalledWith('attempt-1', 'student-1');
    expect(prisma.question.findMany).not.toHaveBeenCalled();
  });

  it('rejects result access before an attempt is submitted', async () => {
    prisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS,
    });

    await expect(service.getResult('attempt-1', 'student-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
