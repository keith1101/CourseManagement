import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionType } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: any;
  let transaction: any;

  beforeEach(() => {
    transaction = {
      question: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      questionOption: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma = {
      exam: { findUnique: jest.fn() },
      question: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      questionOption: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(transaction)),
    };
    service = new QuestionsService(prisma as PrismaService);
  });

  it('rejects creation when the exam does not exist', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-exam', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        contentText: 'Question',
        timeLimitSeconds: 30,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a question and its options in one transaction', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    transaction.question.count.mockResolvedValue(2);
    transaction.question.create.mockResolvedValue({ id: 'question-1' });
    transaction.questionOption.createMany.mockResolvedValue({ count: 2 });
    transaction.question.findUnique.mockResolvedValue({
      id: 'question-1',
      questionOptions: [],
    });

    await expect(
      service.create('exam-1', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        contentText: 'Question',
        timeLimitSeconds: 30,
        options: [
          { contentText: 'A', isCorrect: true },
          { contentText: 'B' },
        ],
      }),
    ).resolves.toEqual({ id: 'question-1', questionOptions: [] });
    expect(transaction.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ examId: 'exam-1', position: 2 }),
      }),
    );
    expect(transaction.questionOption.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ questionId: 'question-1', position: 0 }),
        expect.objectContaining({ questionId: 'question-1', position: 1 }),
      ],
    });
  });

  it('updates question options by replacing the option set', async () => {
    prisma.question.findFirst.mockResolvedValue({ id: 'question-1' });
    transaction.question.update.mockResolvedValue({ id: 'question-1' });
    transaction.questionOption.deleteMany.mockResolvedValue({ count: 2 });
    transaction.questionOption.createMany.mockResolvedValue({ count: 1 });
    transaction.question.findUnique.mockResolvedValue({ id: 'question-1' });

    await service.update('question-1', {
      contentText: 'Updated',
      options: [{ contentText: 'Only option', isCorrect: true }],
    });

    expect(transaction.questionOption.deleteMany).toHaveBeenCalledWith({
      where: { questionId: 'question-1' },
    });
    expect(transaction.questionOption.createMany).toHaveBeenCalled();
  });

  it('rejects an invalid question order', async () => {
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1',
      examId: 'exam-1',
      position: 0,
    });
    prisma.question.count.mockResolvedValue(2);

    await expect(service.updateOrder('question-1', 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects option operations for missing resources', async () => {
    prisma.question.findFirst.mockResolvedValue(null);
    prisma.questionOption.findUnique.mockResolvedValue(null);

    await expect(
      service.createOption('missing', { contentText: 'A' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateOption('missing', { contentText: 'A' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteOption('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not select correctness metadata for public question reads', async () => {
    prisma.question.findFirst.mockResolvedValue({ id: 'question-1', questionOptions: [] });

    await service.find('question-1');

    const include = prisma.question.findFirst.mock.calls[0][0].include;
    expect(include.questionOptions.select).toEqual({
      id: true,
      contentText: true,
      position: true,
    });
    expect(include).not.toHaveProperty('questionAcceptedAnswers');
  });
});
