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
      question: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
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

  it('starts an attempt for a published free exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1', status: 'PUBLISHED', title: 'Exam', accessLevel: 'FREE',
    });
    prisma.user.findUnique.mockResolvedValue({ accessLevel: 'FREE', proExpiresAt: null });
    prisma.exam.findMany.mockResolvedValue([{ id: 'exam-1' }]);
    prisma.examAssignment.findFirst.mockResolvedValue(null);
    prisma.examAttempt.findFirst.mockResolvedValue(null);
    prisma.question.count.mockResolvedValue(1);
    prisma.examAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    prisma.examAttempt.findUnique
      .mockResolvedValueOnce({ id: 'attempt-1', userId: 'student-1', examId: 'exam-1', status: AttemptStatus.IN_PROGRESS })
      .mockResolvedValueOnce({ id: 'attempt-1', examId: 'exam-1', attemptedAnswers: [] });
    prisma.question.findMany.mockResolvedValue([]);

    const result = await service.start('exam-1', 'student-1', {});

    expect(prisma.examAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'student-1', examId: 'exam-1', totalQuestions: 1 }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'attempt-1', questions: [] }));
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
    expect(result.isCorrect).toBe(true);
  });

  it('saves a multiple-choice draft without grading or revealing the answer key', async () => {
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
    prisma.attemptAnswer.findFirst.mockResolvedValue(null);
    prisma.attemptAnswer.create.mockImplementation(async ({ data }: any) => ({
      id: 'answer-1',
      attemptId: 'attempt-1',
      ...data,
    }));

    const result = await service.saveAnswer('attempt-1', 'student-1', {
      questionId: 'question-1', selectedOptionId: 'valid-option',
    });

    expect(prisma.attemptAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectedOptionId: 'valid-option',
        isCorrect: false,
      }),
    });
    expect(result.isCorrect).toBeUndefined();
    expect(result.correctOptionId).toBeUndefined();
    expect(result.explanation).toBeUndefined();
    expect(gcsStorage.resolveReadUrl).not.toHaveBeenCalled();
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
