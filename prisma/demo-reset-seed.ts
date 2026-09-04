import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client';
import {
  AccessLevel,
  AnswerValueType,
  AttemptStatus,
  ExamStatus,
  MaterialType,
  QuestionType,
  UserRole,
} from '../generated/client/enums';

const TARGETS = {
  local: {
    host: 'localhost',
    port: '5432',
    database: 'course_management_db',
    schema: 'public',
  },
  production: {
    host: 'localhost',
    port: '5433',
    database: 'prismaorm',
    schema: 'public',
  },
} as const;

const IDS = {
  users: {
    admin: '10000000-0000-4000-8000-000000000001',
    freeStudent: '10000000-0000-4000-8000-000000000002',
    proStudent: '10000000-0000-4000-8000-000000000003',
    lockedStudent: '10000000-0000-4000-8000-000000000004',
  },
  subscriptions: {
    pro: '20000000-0000-4000-8000-000000000001',
  },
  subjects: {
    mathematics: '30000000-0000-4000-8000-000000000001',
    science: '30000000-0000-4000-8000-000000000002',
    language: '30000000-0000-4000-8000-000000000003',
    inactive: '30000000-0000-4000-8000-000000000004',
  },
  materials: {
    freeVideo: '40000000-0000-4000-8000-000000000001',
    proVideo: '40000000-0000-4000-8000-000000000002',
    draftVideo: '40000000-0000-4000-8000-000000000003',
  },
  exams: {
    draft: '50000000-0000-4000-8000-000000000001',
    freePrimary: '50000000-0000-4000-8000-000000000002',
    freeSecondary: '50000000-0000-4000-8000-000000000003',
    pro: '50000000-0000-4000-8000-000000000004',
  },
  questions: {
    draft: '60000000-0000-4000-8000-000000000001',
    freeCapital: '60000000-0000-4000-8000-000000000002',
    freeScience: '60000000-0000-4000-8000-000000000003',
    freeShort: '60000000-0000-4000-8000-000000000004',
    secondaryFree: '60000000-0000-4000-8000-000000000005',
    proScience: '60000000-0000-4000-8000-000000000006',
    proShort: '60000000-0000-4000-8000-000000000007',
  },
  options: {
    draftA: '70000000-0000-4000-8000-000000000001',
    draftB: '70000000-0000-4000-8000-000000000002',
    draftC: '70000000-0000-4000-8000-000000000003',
    capitalParis: '70000000-0000-4000-8000-000000000004',
    capitalLondon: '70000000-0000-4000-8000-000000000005',
    capitalRome: '70000000-0000-4000-8000-000000000006',
    capitalMadrid: '70000000-0000-4000-8000-000000000007',
    scienceEarth: '70000000-0000-4000-8000-000000000008',
    scienceMars: '70000000-0000-4000-8000-000000000009',
    scienceVenus: '70000000-0000-4000-8000-000000000010',
    scienceJupiter: '70000000-0000-4000-8000-000000000011',
    secondaryMercury: '70000000-0000-4000-8000-000000000012',
    secondaryVenus: '70000000-0000-4000-8000-000000000013',
    secondaryEarth: '70000000-0000-4000-8000-000000000014',
    secondaryMars: '70000000-0000-4000-8000-000000000015',
    proEarth: '70000000-0000-4000-8000-000000000016',
    proMars: '70000000-0000-4000-8000-000000000017',
    proVenus: '70000000-0000-4000-8000-000000000018',
    proJupiter: '70000000-0000-4000-8000-000000000019',
  },
  acceptedAnswers: {
    freeShort: '80000000-0000-4000-8000-000000000001',
    proShort: '80000000-0000-4000-8000-000000000002',
  },
  assignments: {
    freeSubmitted: '90000000-0000-4000-8000-000000000001',
    freeAvailable: '90000000-0000-4000-8000-000000000002',
    proInProgress: '90000000-0000-4000-8000-000000000003',
  },
  attempts: {
    freeCompleted: 'a0000000-0000-4000-8000-000000000001',
    proInProgress: 'a0000000-0000-4000-8000-000000000002',
  },
  answers: {
    freeCapital: 'b0000000-0000-4000-8000-000000000001',
    freeScience: 'b0000000-0000-4000-8000-000000000002',
    freeShort: 'b0000000-0000-4000-8000-000000000003',
    proScience: 'b0000000-0000-4000-8000-000000000004',
  },
} as const;

const DATES = {
  publishedAt: new Date('2026-01-15T00:00:00.000Z'),
  subscriptionStartedAt: new Date('2026-01-01T00:00:00.000Z'),
  subscriptionExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
  assignmentAt: new Date('2026-01-16T00:00:00.000Z'),
  assignmentDueAt: new Date('2099-01-01T00:00:00.000Z'),
  attemptStartedAt: new Date('2026-01-20T00:00:00.000Z'),
  attemptSubmittedAt: new Date('2026-01-20T01:00:00.000Z'),
};

const EXPECTED_COUNTS = {
  User: 4,
  Subscription: 1,
  Subject: 4,
  Material: 3,
  Exam: 4,
  Question: 7,
  QuestionOption: 19,
  QuestionAcceptedAnswer: 2,
  ExamAssignment: 3,
  ExamAttempt: 2,
  AttemptAnswer: 4,
};

type ResetTarget = keyof typeof TARGETS;

function getTarget(): ResetTarget {
  const value = process.env.DEMO_RESET_TARGET;
  if (value !== 'local' && value !== 'production') {
    throw new Error(
      'DEMO_RESET_TARGET must be explicitly set to local or production',
    );
  }

  if (process.env.ALLOW_DEMO_RESET !== 'true') {
    throw new Error('ALLOW_DEMO_RESET=true is required');
  }

  if (
    value === 'local' &&
    process.env.ALLOW_LOCAL_DEMO_RESET !== 'true'
  ) {
    throw new Error('ALLOW_LOCAL_DEMO_RESET=true is required for local runs');
  }

  if (
    value === 'production' &&
    process.env.ALLOW_PRODUCTION_DEMO_RESET !== 'true'
  ) {
    throw new Error(
      'ALLOW_PRODUCTION_DEMO_RESET=true is required for production runs',
    );
  }

  return value;
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const schema = url.searchParams.get('schema') ?? 'public';

  return {
    host: url.hostname,
    port: url.port,
    database,
    schema,
  };
}

function assertConfiguredTarget(
  connectionString: string,
  targetName: ResetTarget,
) {
  const configured = parseDatabaseUrl(connectionString);
  const expected = TARGETS[targetName];
  const matches =
    configured.host === expected.host &&
    configured.port === expected.port &&
    configured.database === expected.database &&
    configured.schema === expected.schema;

  if (!matches) {
    throw new Error(
      `Refusing unexpected ${targetName} target: ${configured.host}:${configured.port}/${configured.database}?schema=${configured.schema}`,
    );
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '<redacted-database-url>');
}

async function main() {
  const targetName = getTarget();
  const connectionString = getRequiredEnv('DATABASE_URL');
  const adminPassword = getRequiredEnv('DEMO_ADMIN_PASSWORD');
  const freeStudentPassword = getRequiredEnv('DEMO_FREE_STUDENT_PASSWORD');
  const proStudentPassword = getRequiredEnv('DEMO_PRO_STUDENT_PASSWORD');
  const lockedStudentPassword = getRequiredEnv('DEMO_LOCKED_STUDENT_PASSWORD');

  assertConfiguredTarget(connectionString, targetName);

  const passwordHashes = await Promise.all([
    bcrypt.hash(adminPassword, 10),
    bcrypt.hash(freeStudentPassword, 10),
    bcrypt.hash(proStudentPassword, 10),
    bcrypt.hash(lockedStudentPassword, 10),
  ]);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$connect();
    const metadata = await prisma.$queryRaw<
      Array<{ database: string; schema: string }>
    >`SELECT current_database() AS database, current_schema() AS schema`;
    const actual = metadata[0];
    const expected = TARGETS[targetName];

    if (
      !actual ||
      actual.database !== expected.database ||
      actual.schema !== expected.schema
    ) {
      throw new Error(
        `Refusing unexpected connected database: ${actual?.database ?? '<unknown>'}/${actual?.schema ?? '<unknown>'}`,
      );
    }

    await prisma.$transaction(
      async (tx) => {
        const migrationRows = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT COUNT(*)::int AS count FROM "public"."_prisma_migrations"`;
        const migrationCountBefore = migrationRows[0]?.count;

        if (migrationCountBefore === undefined) {
          throw new Error('_prisma_migrations could not be read');
        }

        await tx.attemptAnswer.deleteMany();
        await tx.examAttempt.deleteMany();
        await tx.examAssignment.deleteMany();
        await tx.questionOption.deleteMany();
        await tx.questionAcceptedAnswer.deleteMany();
        await tx.question.deleteMany();
        await tx.material.deleteMany();
        await tx.exam.deleteMany();
        await tx.subscription.deleteMany();
        await tx.subject.deleteMany();
        await tx.user.deleteMany();

        await tx.user.createMany({
          data: [
            {
              id: IDS.users.admin,
              fullName: 'Demo Admin',
              email: 'demo-admin@example.test',
              passwordHash: passwordHashes[0],
              role: UserRole.ADMIN,
              isActive: true,
              accessLevel: AccessLevel.FREE,
            },
            {
              id: IDS.users.freeStudent,
              fullName: 'Demo Free Student',
              email: 'demo-free-student@example.test',
              passwordHash: passwordHashes[1],
              role: UserRole.STUDENT,
              isActive: true,
              accessLevel: AccessLevel.FREE,
            },
            {
              id: IDS.users.proStudent,
              fullName: 'Demo Pro Student',
              email: 'demo-pro-student@example.test',
              passwordHash: passwordHashes[2],
              role: UserRole.STUDENT,
              isActive: true,
              accessLevel: AccessLevel.PRO,
              proExpiresAt: DATES.subscriptionExpiresAt,
            },
            {
              id: IDS.users.lockedStudent,
              fullName: 'Demo Locked Student',
              email: 'demo-locked-student@example.test',
              passwordHash: passwordHashes[3],
              role: UserRole.STUDENT,
              isActive: false,
              accessLevel: AccessLevel.FREE,
            },
          ],
        });

        await tx.subscription.create({
          data: {
            id: IDS.subscriptions.pro,
            userId: IDS.users.proStudent,
            startedAt: DATES.subscriptionStartedAt,
            expiresAt: DATES.subscriptionExpiresAt,
          },
        });

        await tx.subject.createMany({
          data: [
            {
              id: IDS.subjects.mathematics,
              code: 'DEMO_MATH',
              name: 'Demo Mathematics',
              description: 'Active demo subject for mathematics content.',
              displayOrder: 1,
              isActive: true,
            },
            {
              id: IDS.subjects.science,
              code: 'DEMO_SCIENCE',
              name: 'Demo Science',
              description: 'Active demo subject for science content.',
              displayOrder: 2,
              isActive: true,
            },
            {
              id: IDS.subjects.language,
              code: 'DEMO_LANGUAGE',
              name: 'Demo Language',
              description: 'Active demo subject for short-answer content.',
              displayOrder: 3,
              isActive: true,
            },
            {
              id: IDS.subjects.inactive,
              code: 'DEMO_INACTIVE',
              name: 'Demo Inactive Subject',
              description: 'Inactive subject for filtering coverage.',
              displayOrder: 4,
              isActive: false,
            },
          ],
        });

        await tx.material.createMany({
          data: [
            {
              id: IDS.materials.freeVideo,
              subjectId: IDS.subjects.mathematics,
              title: 'Demo Free Video Lesson',
              materialType: MaterialType.EMBEDDED_VIDEO,
              storageUrl: null,
              embedUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
              accessLevel: AccessLevel.FREE,
              isPublished: true,
              publishedAt: DATES.publishedAt,
            },
            {
              id: IDS.materials.proVideo,
              subjectId: IDS.subjects.science,
              title: 'Demo Pro Video Lesson',
              materialType: MaterialType.EMBEDDED_VIDEO,
              storageUrl: null,
              embedUrl: 'https://www.youtube.com/embed/aqz-KE-bpKQ',
              accessLevel: AccessLevel.PRO,
              isPublished: true,
              publishedAt: DATES.publishedAt,
            },
            {
              id: IDS.materials.draftVideo,
              subjectId: IDS.subjects.language,
              title: 'Demo Draft Video Lesson',
              materialType: MaterialType.EMBEDDED_VIDEO,
              storageUrl: null,
              embedUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
              accessLevel: AccessLevel.FREE,
              isPublished: false,
              publishedAt: null,
            },
          ],
        });

        await tx.exam.createMany({
          data: [
            {
              id: IDS.exams.draft,
              title: 'Demo Draft Assessment',
              description: 'Draft assessment visible to administrators.',
              status: ExamStatus.DRAFT,
              accessLevel: AccessLevel.FREE,
              displayOrder: 1,
              publishedAt: null,
              deletedAt: null,
            },
            {
              id: IDS.exams.freePrimary,
              title: 'Demo Free Assessment 1',
              description: 'Published free assessment with mixed question types.',
              status: ExamStatus.PUBLISHED,
              accessLevel: AccessLevel.FREE,
              displayOrder: 2,
              publishedAt: DATES.publishedAt,
              deletedAt: null,
            },
            {
              id: IDS.exams.freeSecondary,
              title: 'Demo Free Assessment 2',
              description: 'Second published free assessment for access-limit coverage.',
              status: ExamStatus.PUBLISHED,
              accessLevel: AccessLevel.FREE,
              displayOrder: 3,
              publishedAt: DATES.publishedAt,
              deletedAt: null,
            },
            {
              id: IDS.exams.pro,
              title: 'Demo Pro Assessment',
              description: 'Published Pro assessment for subscription coverage.',
              status: ExamStatus.PUBLISHED,
              accessLevel: AccessLevel.PRO,
              displayOrder: 4,
              publishedAt: DATES.publishedAt,
              deletedAt: null,
            },
          ],
        });

        await tx.question.createMany({
          data: [
            {
              id: IDS.questions.draft,
              examId: IDS.exams.draft,
              subjectId: IDS.subjects.mathematics,
              questionType: QuestionType.MULTIPLE_CHOICE,
              contentText: 'Which operation is used to add two numbers?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'Think about combining quantities.',
              instruction: 'Choose one answer.',
              explaination: 'Addition combines quantities.',
              explanationImageUrl: null,
              timeLimitSeconds: 60,
              correctTextAnswer: null,
              position: 0,
              deletedAt: null,
            },
            {
              id: IDS.questions.freeCapital,
              examId: IDS.exams.freePrimary,
              subjectId: IDS.subjects.mathematics,
              questionType: QuestionType.MULTIPLE_CHOICE,
              contentText: 'Which city is the capital of France?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'It is known for the Eiffel Tower.',
              instruction: 'Choose one answer.',
              explaination: 'Paris is the capital of France.',
              explanationImageUrl: null,
              timeLimitSeconds: 60,
              correctTextAnswer: null,
              position: 0,
              deletedAt: null,
            },
            {
              id: IDS.questions.freeScience,
              examId: IDS.exams.freePrimary,
              subjectId: IDS.subjects.science,
              questionType: QuestionType.MULTIPLE_CHOICE,
              contentText: 'Which planet is known as the Red Planet?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'It is the fourth planet from the Sun.',
              instruction: 'Choose one answer.',
              explaination: 'Mars is known as the Red Planet.',
              explanationImageUrl: null,
              timeLimitSeconds: 60,
              correctTextAnswer: null,
              position: 1,
              deletedAt: null,
            },
            {
              id: IDS.questions.freeShort,
              examId: IDS.exams.freePrimary,
              subjectId: IDS.subjects.language,
              questionType: QuestionType.SHORT_ANSWER,
              contentText: 'What is the capital of Vietnam?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'The answer has two words.',
              instruction: 'Enter a short text answer.',
              explaination: 'Hà Nội is the capital of Vietnam.',
              explanationImageUrl: null,
              timeLimitSeconds: 90,
              correctTextAnswer: 'Hà Nội',
              position: 2,
              deletedAt: null,
            },
            {
              id: IDS.questions.secondaryFree,
              examId: IDS.exams.freeSecondary,
              subjectId: IDS.subjects.mathematics,
              questionType: QuestionType.MULTIPLE_CHOICE,
              contentText: 'Which number is even?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'An even number is divisible by two.',
              instruction: 'Choose one answer.',
              explaination: 'Eight is divisible by two.',
              explanationImageUrl: null,
              timeLimitSeconds: 60,
              correctTextAnswer: null,
              position: 0,
              deletedAt: null,
            },
            {
              id: IDS.questions.proScience,
              examId: IDS.exams.pro,
              subjectId: IDS.subjects.science,
              questionType: QuestionType.MULTIPLE_CHOICE,
              contentText: 'Which gas do plants absorb during photosynthesis?',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'It is present in the air and contains carbon.',
              instruction: 'Choose one answer.',
              explaination: 'Plants absorb carbon dioxide during photosynthesis.',
              explanationImageUrl: null,
              timeLimitSeconds: 60,
              correctTextAnswer: null,
              position: 0,
              deletedAt: null,
            },
            {
              id: IDS.questions.proShort,
              examId: IDS.exams.pro,
              subjectId: IDS.subjects.language,
              questionType: QuestionType.SHORT_ANSWER,
              contentText: 'Write the first three letters of the English alphabet.',
              imageUrl: null,
              hintImageUrl: null,
              hint: 'The answer is three letters.',
              instruction: 'Enter a short text answer.',
              explaination: 'The answer is ABC.',
              explanationImageUrl: null,
              timeLimitSeconds: 90,
              correctTextAnswer: 'ABC',
              position: 1,
              deletedAt: null,
            },
          ],
        });

        await tx.questionOption.createMany({
          data: [
            { id: IDS.options.draftA, questionId: IDS.questions.draft, contentText: 'Addition', isCorrect: true, position: 0, imageUrl: null },
            { id: IDS.options.draftB, questionId: IDS.questions.draft, contentText: 'Subtraction', isCorrect: false, position: 1, imageUrl: null },
            { id: IDS.options.draftC, questionId: IDS.questions.draft, contentText: 'Division', isCorrect: false, position: 2, imageUrl: null },
            { id: IDS.options.capitalParis, questionId: IDS.questions.freeCapital, contentText: 'Paris', isCorrect: true, position: 0, imageUrl: null },
            { id: IDS.options.capitalLondon, questionId: IDS.questions.freeCapital, contentText: 'London', isCorrect: false, position: 1, imageUrl: null },
            { id: IDS.options.capitalRome, questionId: IDS.questions.freeCapital, contentText: 'Rome', isCorrect: false, position: 2, imageUrl: null },
            { id: IDS.options.capitalMadrid, questionId: IDS.questions.freeCapital, contentText: 'Madrid', isCorrect: false, position: 3, imageUrl: null },
            { id: IDS.options.scienceEarth, questionId: IDS.questions.freeScience, contentText: 'Earth', isCorrect: false, position: 0, imageUrl: null },
            { id: IDS.options.scienceMars, questionId: IDS.questions.freeScience, contentText: 'Mars', isCorrect: true, position: 1, imageUrl: null },
            { id: IDS.options.scienceVenus, questionId: IDS.questions.freeScience, contentText: 'Venus', isCorrect: false, position: 2, imageUrl: null },
            { id: IDS.options.scienceJupiter, questionId: IDS.questions.freeScience, contentText: 'Jupiter', isCorrect: false, position: 3, imageUrl: null },
            { id: IDS.options.secondaryMercury, questionId: IDS.questions.secondaryFree, contentText: 'Mercury', isCorrect: false, position: 0, imageUrl: null },
            { id: IDS.options.secondaryVenus, questionId: IDS.questions.secondaryFree, contentText: 'Venus', isCorrect: false, position: 1, imageUrl: null },
            { id: IDS.options.secondaryEarth, questionId: IDS.questions.secondaryFree, contentText: 'Earth', isCorrect: false, position: 2, imageUrl: null },
            { id: IDS.options.secondaryMars, questionId: IDS.questions.secondaryFree, contentText: 'Mars', isCorrect: true, position: 3, imageUrl: null },
            { id: IDS.options.proEarth, questionId: IDS.questions.proScience, contentText: 'Oxygen', isCorrect: false, position: 0, imageUrl: null },
            { id: IDS.options.proMars, questionId: IDS.questions.proScience, contentText: 'Carbon dioxide', isCorrect: true, position: 1, imageUrl: null },
            { id: IDS.options.proVenus, questionId: IDS.questions.proScience, contentText: 'Nitrogen', isCorrect: false, position: 2, imageUrl: null },
            { id: IDS.options.proJupiter, questionId: IDS.questions.proScience, contentText: 'Hydrogen', isCorrect: false, position: 3, imageUrl: null },
          ],
        });

        await tx.questionAcceptedAnswer.createMany({
          data: [
            {
              id: IDS.acceptedAnswers.freeShort,
              questionId: IDS.questions.freeShort,
              answerType: AnswerValueType.TEXT,
              rawValue: 'Hà Nội',
              isPrimary: true,
              normalizedText: normalize('Hà Nội'),
              content: 'Primary accepted answer',
              isCorrect: true,
              position: 0,
              numericValue: null,
            },
            {
              id: IDS.acceptedAnswers.proShort,
              questionId: IDS.questions.proShort,
              answerType: AnswerValueType.TEXT,
              rawValue: 'ABC',
              isPrimary: true,
              normalizedText: 'abc',
              content: 'Primary accepted answer',
              isCorrect: true,
              position: 0,
              numericValue: null,
            },
          ],
        });

        await tx.examAssignment.createMany({
          data: [
            {
              id: IDS.assignments.freeSubmitted,
              userId: IDS.users.freeStudent,
              examId: IDS.exams.freePrimary,
              assignedAt: DATES.assignmentAt,
              dueAt: DATES.assignmentDueAt,
            },
            {
              id: IDS.assignments.freeAvailable,
              userId: IDS.users.freeStudent,
              examId: IDS.exams.freeSecondary,
              assignedAt: DATES.assignmentAt,
              dueAt: DATES.assignmentDueAt,
            },
            {
              id: IDS.assignments.proInProgress,
              userId: IDS.users.proStudent,
              examId: IDS.exams.pro,
              assignedAt: DATES.assignmentAt,
              dueAt: DATES.assignmentDueAt,
            },
          ],
        });

        await tx.examAttempt.createMany({
          data: [
            {
              id: IDS.attempts.freeCompleted,
              userId: IDS.users.freeStudent,
              examId: IDS.exams.freePrimary,
              assignmentId: IDS.assignments.freeSubmitted,
              status: AttemptStatus.COMPLETED,
              submittedAt: DATES.attemptSubmittedAt,
              correctCount: 2,
              totalQuestions: 3,
              startedAt: DATES.attemptStartedAt,
            },
            {
              id: IDS.attempts.proInProgress,
              userId: IDS.users.proStudent,
              examId: IDS.exams.pro,
              assignmentId: IDS.assignments.proInProgress,
              status: AttemptStatus.IN_PROGRESS,
              submittedAt: null,
              correctCount: 0,
              totalQuestions: 2,
              startedAt: DATES.attemptStartedAt,
            },
          ],
        });

        await tx.attemptAnswer.createMany({
          data: [
            {
              id: IDS.answers.freeCapital,
              attemptId: IDS.attempts.freeCompleted,
              questionId: IDS.questions.freeCapital,
              selectedOptionId: IDS.options.capitalParis,
              answerType: AnswerValueType.TEXT,
              rawValue: 'Paris',
              normalizedText: 'paris',
              content: null,
              isCorrect: true,
              position: 0,
              numericValue: null,
            },
            {
              id: IDS.answers.freeScience,
              attemptId: IDS.attempts.freeCompleted,
              questionId: IDS.questions.freeScience,
              selectedOptionId: IDS.options.scienceEarth,
              answerType: AnswerValueType.TEXT,
              rawValue: 'Earth',
              normalizedText: 'earth',
              content: null,
              isCorrect: false,
              position: 1,
              numericValue: null,
            },
            {
              id: IDS.answers.freeShort,
              attemptId: IDS.attempts.freeCompleted,
              questionId: IDS.questions.freeShort,
              selectedOptionId: null,
              answerType: AnswerValueType.TEXT,
              rawValue: 'Hà Nội',
              normalizedText: normalize('Hà Nội'),
              content: 'Short-answer response',
              isCorrect: true,
              position: 2,
              numericValue: null,
            },
            {
              id: IDS.answers.proScience,
              attemptId: IDS.attempts.proInProgress,
              questionId: IDS.questions.proScience,
              selectedOptionId: IDS.options.proEarth,
              answerType: AnswerValueType.TEXT,
              rawValue: 'Oxygen',
              normalizedText: 'oxygen',
              content: null,
              isCorrect: false,
              position: 0,
              numericValue: null,
            },
          ],
        });

        // The Prisma transaction uses one database connection. Keep these
        // verification queries sequential so the pg client is not asked to
        // execute concurrent work on that connection.
        const countEntries: Array<readonly [string, number]> = [];
        for (const [model, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
          const count = await (() => {
            switch (model) {
              case 'User': return tx.user.count();
              case 'Subscription': return tx.subscription.count();
              case 'Subject': return tx.subject.count();
              case 'Material': return tx.material.count();
              case 'Exam': return tx.exam.count();
              case 'Question': return tx.question.count();
              case 'QuestionOption': return tx.questionOption.count();
              case 'QuestionAcceptedAnswer': return tx.questionAcceptedAnswer.count();
              case 'ExamAssignment': return tx.examAssignment.count();
              case 'ExamAttempt': return tx.examAttempt.count();
              case 'AttemptAnswer': return tx.attemptAnswer.count();
              default: throw new Error(`Unknown expected model ${model}`);
            }
          })();
          if (count !== expectedCount) {
            throw new Error(`${model} expected ${expectedCount}, got ${count}`);
          }
          countEntries.push([model, count]);
        }

        // Relation includes can make Prisma schedule multiple queries at once
        // on the interactive transaction's single pg connection. Load the
        // validation data explicitly and sequentially instead.
        const questions = await tx.question.findMany({
          select: {
            id: true,
            subjectId: true,
            questionType: true,
            correctTextAnswer: true,
          },
        });
        const questionIds = questions.map((question) => question.id);
        const subjectIds = [...new Set(questions.map((question) => question.subjectId))];
        const subjects = await tx.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, isActive: true },
        });
        const questionOptions = await tx.questionOption.findMany({
          where: { questionId: { in: questionIds } },
          select: { questionId: true, isCorrect: true },
        });
        const questionAcceptedAnswers = await tx.questionAcceptedAnswer.findMany({
          where: { questionId: { in: questionIds } },
          select: { questionId: true },
        });
        const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
        const optionsByQuestionId = new Map<string, Array<{ isCorrect: boolean }>>();
        for (const option of questionOptions) {
          const options = optionsByQuestionId.get(option.questionId) ?? [];
          options.push(option);
          optionsByQuestionId.set(option.questionId, options);
        }
        const acceptedAnswersByQuestionId = new Map<string, string[]>();
        for (const acceptedAnswer of questionAcceptedAnswers) {
          const acceptedAnswers = acceptedAnswersByQuestionId.get(acceptedAnswer.questionId) ?? [];
          acceptedAnswers.push(acceptedAnswer.questionId);
          acceptedAnswersByQuestionId.set(acceptedAnswer.questionId, acceptedAnswers);
        }

        for (const question of questions) {
          const subject = subjectsById.get(question.subjectId);
          const options = optionsByQuestionId.get(question.id) ?? [];
          const acceptedAnswers = acceptedAnswersByQuestionId.get(question.id) ?? [];

          if (!subject || !subject.isActive) {
            throw new Error(`Question ${question.id} references an inactive subject`);
          }
          if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
            if (question.correctTextAnswer !== null) {
              throw new Error(`Multiple-choice question ${question.id} has a text answer`);
            }
            if (
              options.filter((option) => option.isCorrect).length !== 1
            ) {
              throw new Error(`Multiple-choice question ${question.id} lacks exactly one correct option`);
            }
            if (acceptedAnswers.length !== 0) {
              throw new Error(`Multiple-choice question ${question.id} has accepted text answers`);
            }
          } else if (
            options.length !== 0 ||
            !question.correctTextAnswer ||
            acceptedAnswers.length === 0
          ) {
            throw new Error(`Short-answer question ${question.id} is incomplete`);
          }
        }

        const exams = await tx.exam.findMany({
          include: { _count: { select: { questions: true } } },
        });
        if (exams.some((exam) => exam._count.questions === 0)) {
          throw new Error('Every demo exam must contain at least one question');
        }

        const proUser = await tx.user.findUnique({
          where: { id: IDS.users.proStudent },
          include: { subscriptions: true },
        });
        if (
          !proUser ||
          !proUser.isActive ||
          proUser.accessLevel !== AccessLevel.PRO ||
          !proUser.proExpiresAt ||
          proUser.proExpiresAt <= new Date() ||
          proUser.subscriptions.length !== 1 ||
          proUser.subscriptions[0].expiresAt <= new Date()
        ) {
          throw new Error('Pro demo user and subscription are inconsistent');
        }

        const completedAttempt = await tx.examAttempt.findUnique({
          where: { id: IDS.attempts.freeCompleted },
          include: { attemptedAnswers: true },
        });
        if (
          !completedAttempt ||
          completedAttempt.status !== AttemptStatus.COMPLETED ||
          completedAttempt.submittedAt === null ||
          completedAttempt.totalQuestions !== 3 ||
          completedAttempt.correctCount !== 2 ||
          completedAttempt.attemptedAnswers.length !== 3 ||
          completedAttempt.attemptedAnswers.filter((answer) => answer.isCorrect).length !== 2
        ) {
          throw new Error('Completed demo attempt is inconsistent with its answers');
        }

        const inProgressAttempt = await tx.examAttempt.findUnique({
          where: { id: IDS.attempts.proInProgress },
        });
        if (
          !inProgressAttempt ||
          inProgressAttempt.status !== AttemptStatus.IN_PROGRESS ||
          inProgressAttempt.submittedAt !== null
        ) {
          throw new Error('In-progress demo attempt is inconsistent');
        }

        const migrationRowsAfter = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT COUNT(*)::int AS count FROM "public"."_prisma_migrations"`;
        if (migrationRowsAfter[0]?.count !== migrationCountBefore) {
          throw new Error('_prisma_migrations changed during demo reset/seed');
        }

        console.log(
          JSON.stringify({
            target: targetName,
            applicationRows: countEntries.reduce((total, [, count]) => total + count, 0),
            migrationRowsPreserved: migrationCountBefore,
          }),
        );
      },
      { maxWait: 30_000, timeout: 120_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(`Demo reset/seed failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
