import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionType } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from './questions.service';
import { studentQuestionSelect } from './question-response';

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

function forbiddenStudentKeys(value: unknown, path = 'root'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenStudentKeys(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => [
    ...(FORBIDDEN_STUDENT_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...forbiddenStudentKeys(nestedValue, `${path}.${key}`),
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
  correctTextAnswer: 'secret short answer',
  explaination: 'The answer is A',
  explanationImageUrl: 'gs://bucket/explanation.png',
  questionOptions: [
    { id: 'correct-option', contentText: 'A', imageUrl: null, isCorrect: true, position: 0 },
    { id: 'wrong-option', contentText: 'B', imageUrl: null, isCorrect: false, position: 1 },
  ],
  questionAcceptedAnswers: [
    { id: 'accepted-1', rawValue: 'secret short answer', answerType: 'TEXT', isCorrect: true, position: 0 },
  ],
};

describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: any;
  let gcsStorage: any;
  let examsService: any;
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
      subject: { findUnique: jest.fn() },
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
    gcsStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getSignedReadUrl: jest.fn(),
      resolveReadUrl: jest.fn(async (storageUri: string | null | undefined) => ({
        url: storageUri,
        storageUri: storageUri?.startsWith('gs://') ? storageUri : undefined,
      })),
    };
    examsService = {
      assertStudentCanAccessExam: jest.fn(),
    };
    service = new QuestionsService(prisma as PrismaService, gcsStorage, examsService);
  });

  it('uploads an image to question storage and returns a signed reference', async () => {
    gcsStorage.upload.mockResolvedValue({
      objectName: 'questions/image-1.png',
      gsUri: 'gs://bucket/questions/image-1.png',
    });
    gcsStorage.getSignedReadUrl.mockResolvedValue('https://signed.example/image-1.png');

    const result = await service.uploadImage({
      buffer: Buffer.from('image'),
      originalname: 'question image.png',
      mimetype: 'image/png',
      size: 5,
    });

    expect(gcsStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'question image.png' }),
      expect.stringMatching(/^questions\/[0-9a-f-]+-question-image\.png$/),
    );
    expect(result).toEqual({
      url: 'https://signed.example/image-1.png',
      imageUrl: 'https://signed.example/image-1.png',
      storageUri: 'gs://bucket/questions/image-1.png',
      expiresAt: expect.any(String),
    });
  });

  it('rejects Base64 image references in question JSON', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', isActive: true });

    await expect(
      service.create('exam-1', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        subjectId: 'subject-1',
        contentText: 'Question',
        imageUrl: 'data:image/png;base64,abc',
        timeLimitSeconds: 30,
        options: [{ contentText: 'A', isCorrect: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects creation when the exam does not exist', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-exam', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        subjectId: 'subject-1',
        contentText: 'Question',
        timeLimitSeconds: 30,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a question and its options in one transaction', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', isActive: true });
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
        subjectId: 'subject-1',
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

  it('rejects a multiple-choice question without exactly one correct option', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', isActive: true });

    await expect(
      service.create('exam-1', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        subjectId: 'subject-1',
        contentText: 'Question',
        timeLimitSeconds: 30,
        options: [
          { contentText: 'A', isCorrect: false },
          { contentText: 'B', isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a multiple-choice question with a text answer key', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', isActive: true });

    await expect(
      service.create('exam-1', {
        questionType: QuestionType.MULTIPLE_CHOICE,
        subjectId: 'subject-1',
        contentText: 'Question',
        timeLimitSeconds: 30,
        correctTextAnswer: 'A',
        options: [
          { contentText: 'A', isCorrect: true },
          { contentText: 'B', isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects replacing a multiple-choice option set with multiple correct options', async () => {
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1',
      questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null,
      questionOptions: [
        { id: 'option-1', contentText: 'A', isCorrect: true },
        { id: 'option-2', contentText: 'B', isCorrect: false },
      ],
    });

    await expect(
      service.update('question-1', {
        options: [
          { contentText: 'A', isCorrect: true },
          { contentText: 'B', isCorrect: true },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects adding an option without a correct answer to a multiple-choice question', async () => {
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1',
      questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null,
      questionOptions: [],
    });

    await expect(
      service.createOption('question-1', { contentText: 'A' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.questionOption.count).not.toHaveBeenCalled();
  });

  it('rejects changing a multiple-choice option to create a second correct answer', async () => {
    prisma.questionOption.findUnique.mockResolvedValue({
      id: 'option-2',
      isCorrect: false,
      question: {
        questionType: QuestionType.MULTIPLE_CHOICE,
        correctTextAnswer: null,
        deletedAt: null,
        exam: { deletedAt: null },
        questionOptions: [
          { id: 'option-1', isCorrect: true },
          { id: 'option-2', isCorrect: false },
        ],
      },
    });

    await expect(
      service.updateOption('option-2', { isCorrect: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.questionOption.update).not.toHaveBeenCalled();
  });

  it('rejects deleting the only correct option from a multiple-choice question', async () => {
    prisma.questionOption.findUnique.mockResolvedValue({
      id: 'option-1',
      isCorrect: true,
      question: {
        questionType: QuestionType.MULTIPLE_CHOICE,
        correctTextAnswer: null,
        deletedAt: null,
        exam: { deletedAt: null },
        questionOptions: [
          { id: 'option-1', isCorrect: true },
          { id: 'option-2', isCorrect: false },
        ],
      },
    });

    await expect(service.deleteOption('option-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.questionOption.delete).not.toHaveBeenCalled();
  });

  it('updates question options by replacing the option set', async () => {
    prisma.question.findFirst.mockResolvedValue({
      id: 'question-1',
      questionType: QuestionType.MULTIPLE_CHOICE,
      correctTextAnswer: null,
      questionOptions: [
        { id: 'option-1', contentText: 'A', isCorrect: true },
        { id: 'option-2', contentText: 'B', isCorrect: false },
      ],
    });
    transaction.question.update.mockResolvedValue({ id: 'question-1' });
    transaction.questionOption.deleteMany.mockResolvedValue({ count: 2 });
    transaction.questionOption.createMany.mockResolvedValue({ count: 2 });
    transaction.question.findUnique.mockResolvedValue({ id: 'question-1' });

    await service.update('question-1', {
      contentText: 'Updated',
      options: [
        { contentText: 'A', isCorrect: true },
        { contentText: 'B', isCorrect: false },
      ],
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

  it('filters answer keys from a published multiple-choice student question response', async () => {
    prisma.question.findFirst.mockResolvedValue(questionWithAnswerData);

    const result = await service.find('question-1');

    expect(forbiddenStudentKeys(result)).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      id: 'question-1',
      questionType: QuestionType.MULTIPLE_CHOICE,
      questionOptions: [
        expect.objectContaining({ id: 'correct-option', contentText: 'A' }),
        expect.objectContaining({ id: 'wrong-option', contentText: 'B' }),
      ],
    }));
    expect(prisma.question.findFirst.mock.calls[0][0].select).toEqual(
      studentQuestionSelect,
    );
  });

  it('filters answer keys from the student exam question collection', async () => {
    prisma.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    prisma.question.findMany.mockResolvedValue([questionWithAnswerData]);

    const result = await service.findByExam('exam-1', false, 'student-1');

    expect(forbiddenStudentKeys(result)).toEqual([]);
    expect(result).toHaveLength(1);
    expect(prisma.question.findMany.mock.calls[0][0].select).toEqual(
      studentQuestionSelect,
    );
    expect(examsService.assertStudentCanAccessExam).toHaveBeenCalledWith(
      'exam-1',
      'student-1',
    );
  });

  it('does not load an exam question collection without student authorization context', async () => {
    await expect(service.findByExam('exam-1')).rejects.toThrow(
      'Authenticated student context is required',
    );
    expect(prisma.question.findMany).not.toHaveBeenCalled();
  });

  it('filters correct text and accepted answers from a short-answer student response', async () => {
    prisma.question.findFirst.mockResolvedValue({
      ...questionWithAnswerData,
      questionType: QuestionType.SHORT_ANSWER,
      correctTextAnswer: 'Paris',
      questionOptions: [],
      questionAcceptedAnswers: [
        { id: 'accepted-1', rawValue: 'Paris', answerType: 'TEXT', isCorrect: true, position: 0 },
      ],
    });

    const result = await service.find('question-1');

    expect(forbiddenStudentKeys(result)).toEqual([]);
    expect(result.questionType).toBe(QuestionType.SHORT_ANSWER);
    expect(result.questionOptions).toEqual([]);
  });

  it('preserves answer data for admin question management reads', async () => {
    prisma.question.findFirst.mockResolvedValue(questionWithAnswerData);

    const result = await service.find('question-1', true);

    expect(result).toEqual(expect.objectContaining({
      correctTextAnswer: 'secret short answer',
      questionOptions: expect.arrayContaining([
        expect.objectContaining({ id: 'correct-option', isCorrect: true }),
      ]),
      questionAcceptedAnswers: expect.arrayContaining([
        expect.objectContaining({ rawValue: 'secret short answer' }),
      ]),
    }));
    expect(prisma.question.findFirst.mock.calls[0][0].include).toBeDefined();
  });
});
