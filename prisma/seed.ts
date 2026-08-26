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

const IDS = {
  admin: '11111111-1111-4111-8111-111111111111',
  freeStudent: '22222222-2222-4222-8222-222222222222',
  proStudent: '33333333-3333-4333-8333-333333333333',
  inactiveStudent: '44444444-4444-4444-8444-444444444444',
  subscription: '55555555-5555-4555-8555-555555555555',
  mathSubject: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  scienceSubject: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  inactiveSubject: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  materialPdf: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  materialDocx: 'd1111111-1111-4111-8111-111111111111',
  materialVideo: 'd2222222-2222-4222-8222-222222222222',
  draftExam: 'e1111111-1111-4111-8111-111111111111',
  freeExam: 'e2222222-2222-4222-8222-222222222222',
  proExam: 'e3333333-3333-4333-8333-333333333333',
  multipleChoiceQuestion: 'f1111111-1111-4111-8111-111111111111',
  shortAnswerQuestion: 'f2222222-2222-4222-8222-222222222222',
  proQuestion: 'f3333333-3333-4333-8333-333333333333',
  optionParis: 'a1111111-1111-4111-8111-111111111111',
  optionLondon: 'a2222222-2222-4222-8222-222222222222',
  optionRome: 'a3333333-3333-4333-8333-333333333333',
  shortAnswerAccepted: 'a4444444-4444-4444-8444-444444444444',
  optionMadrid: 'a5555555-5555-4555-8555-555555555555',
  optionMars: 'a6666666-6666-4666-8666-666666666666',
  optionJupiter: 'a7777777-7777-4777-8777-777777777777',
  optionVenus: 'a8888888-8888-4888-8888-888888888888',
  optionMercury: 'a9999999-9999-4999-8999-999999999999',
  assignment: 'b1111111-1111-4111-8111-111111111111',
  inProgressAttempt: 'b2222222-2222-4222-8222-222222222222',
  completedAttempt: 'b3333333-3333-4333-8333-333333333333',
  completedFreeMcAnswer: 'c1111111-1111-4111-8111-111111111111',
  completedShortAnswer: 'c2222222-2222-4222-8222-222222222222',
} as const;

const DATE_OF_BIRTH = new Date('1995-05-15T00:00:00.000Z');
const PRO_EXPIRES_AT = new Date('2099-01-01T00:00:00.000Z');
const PUBLISHED_AT = new Date('2026-01-15T00:00:00.000Z');
const STARTED_AT = new Date('2026-01-20T00:00:00.000Z');
const SUBMITTED_AT = new Date('2026-01-20T01:00:00.000Z');
const DUE_AT = new Date('2099-01-01T00:00:00.000Z');

function readSeedConfig() {
  if (process.env.ALLOW_TEST_SEED !== 'true') {
    throw new Error('Seed requires ALLOW_TEST_SEED=true');
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const studentPassword = process.env.SEED_STUDENT_PASSWORD;
  const connectionString = process.env.DATABASE_URL;

  if (!adminPassword || !studentPassword) {
    throw new Error(
      'Seed requires SEED_ADMIN_PASSWORD and SEED_STUDENT_PASSWORD',
    );
  }

  if (!connectionString) {
    throw new Error('Seed requires DATABASE_URL');
  }

  return { adminPassword, studentPassword, connectionString };
}

async function main() {
  const { adminPassword, studentPassword, connectionString } =
    readSeedConfig();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const [adminPasswordHash, studentPasswordHash] = await Promise.all([
      bcrypt.hash(adminPassword, 10),
      bcrypt.hash(studentPassword, 10),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: IDS.admin },
        update: {
          fullName: 'TEST_Admin',
          email: 'test-admin@example.test',
          phone: '+84900000001',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: adminPasswordHash,
          role: UserRole.ADMIN,
          isActive: true,
          accessLevel: AccessLevel.FREE,
          proExpiresAt: null,
          lastLoginAt: null,
        },
        create: {
          id: IDS.admin,
          fullName: 'TEST_Admin',
          email: 'test-admin@example.test',
          phone: '+84900000001',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: adminPasswordHash,
          role: UserRole.ADMIN,
          isActive: true,
          accessLevel: AccessLevel.FREE,
        },
      });

      await tx.user.upsert({
        where: { id: IDS.freeStudent },
        update: {
          fullName: 'TEST_Student_Free',
          email: 'test-student-free@example.test',
          phone: '+84900000002',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: true,
          accessLevel: AccessLevel.FREE,
          proExpiresAt: null,
          lastLoginAt: null,
        },
        create: {
          id: IDS.freeStudent,
          fullName: 'TEST_Student_Free',
          email: 'test-student-free@example.test',
          phone: '+84900000002',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: true,
          accessLevel: AccessLevel.FREE,
        },
      });

      await tx.user.upsert({
        where: { id: IDS.proStudent },
        update: {
          fullName: 'TEST_Student_Pro',
          email: 'test-student-pro@example.test',
          phone: '+84900000003',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: true,
          accessLevel: AccessLevel.PRO,
          proExpiresAt: PRO_EXPIRES_AT,
          lastLoginAt: null,
        },
        create: {
          id: IDS.proStudent,
          fullName: 'TEST_Student_Pro',
          email: 'test-student-pro@example.test',
          phone: '+84900000003',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: true,
          accessLevel: AccessLevel.PRO,
          proExpiresAt: PRO_EXPIRES_AT,
        },
      });

      await tx.user.upsert({
        where: { id: IDS.inactiveStudent },
        update: {
          fullName: 'TEST_Student_Inactive',
          email: 'test-student-inactive@example.test',
          phone: '+84900000004',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: false,
          accessLevel: AccessLevel.FREE,
          proExpiresAt: null,
          lastLoginAt: null,
        },
        create: {
          id: IDS.inactiveStudent,
          fullName: 'TEST_Student_Inactive',
          email: 'test-student-inactive@example.test',
          phone: '+84900000004',
          dateOfBirth: DATE_OF_BIRTH,
          passwordHash: studentPasswordHash,
          role: UserRole.STUDENT,
          isActive: false,
          accessLevel: AccessLevel.FREE,
        },
      });

      await tx.subscription.upsert({
        where: { id: IDS.subscription },
        update: {
          userId: IDS.proStudent,
          startedAt: PUBLISHED_AT,
          expiresAt: PRO_EXPIRES_AT,
          revokedAt: null,
        },
        create: {
          id: IDS.subscription,
          userId: IDS.proStudent,
          startedAt: PUBLISHED_AT,
          expiresAt: PRO_EXPIRES_AT,
        },
      });

      await tx.subject.upsert({
        where: { id: IDS.mathSubject },
        update: {
          code: 'TEST_MATH',
          name: 'TEST_Toán',
          description: 'Subject used by the test seed',
          displayOrder: 1,
          isActive: true,
        },
        create: {
          id: IDS.mathSubject,
          code: 'TEST_MATH',
          name: 'TEST_Toán',
          description: 'Subject used by the test seed',
          displayOrder: 1,
          isActive: true,
        },
      });

      await tx.subject.upsert({
        where: { id: IDS.scienceSubject },
        update: {
          code: 'TEST_SCIENCE',
          name: 'TEST_Khoa học tự nhiên',
          description: 'Second active subject used by the test seed',
          displayOrder: 2,
          isActive: true,
        },
        create: {
          id: IDS.scienceSubject,
          code: 'TEST_SCIENCE',
          name: 'TEST_Khoa học tự nhiên',
          description: 'Second active subject used by the test seed',
          displayOrder: 2,
          isActive: true,
        },
      });

      await tx.subject.upsert({
        where: { id: IDS.inactiveSubject },
        update: {
          code: 'TEST_INACTIVE',
          name: 'TEST_Subject_Inactive',
          description: 'Inactive subject used for authorization tests',
          displayOrder: 3,
          isActive: false,
        },
        create: {
          id: IDS.inactiveSubject,
          code: 'TEST_INACTIVE',
          name: 'TEST_Subject_Inactive',
          description: 'Inactive subject used for authorization tests',
          displayOrder: 3,
          isActive: false,
        },
      });

      await tx.material.upsert({
        where: { id: IDS.materialPdf },
        update: {
          subjectId: IDS.mathSubject,
          title: 'TEST_Material_PDF',
          materialType: MaterialType.PDF,
          storageUrl: 'https://example.com/test-material.pdf',
          embedUrl: null,
          originalFileName: 'TEST_material.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 1024,
          accessLevel: AccessLevel.FREE,
          isPublished: true,
          publishedAt: PUBLISHED_AT,
        },
        create: {
          id: IDS.materialPdf,
          subjectId: IDS.mathSubject,
          title: 'TEST_Material_PDF',
          materialType: MaterialType.PDF,
          storageUrl: 'https://example.com/test-material.pdf',
          originalFileName: 'TEST_material.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 1024,
          accessLevel: AccessLevel.FREE,
          isPublished: true,
          publishedAt: PUBLISHED_AT,
        },
      });

      await tx.material.upsert({
        where: { id: IDS.materialDocx },
        update: {
          subjectId: IDS.mathSubject,
          title: 'TEST_Material_DOCX',
          materialType: MaterialType.DOCX,
          storageUrl: 'https://example.com/test-material.docx',
          embedUrl: null,
          originalFileName: 'TEST_material.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 2048,
          accessLevel: AccessLevel.PRO,
          isPublished: false,
          publishedAt: null,
        },
        create: {
          id: IDS.materialDocx,
          subjectId: IDS.mathSubject,
          title: 'TEST_Material_DOCX',
          materialType: MaterialType.DOCX,
          storageUrl: 'https://example.com/test-material.docx',
          originalFileName: 'TEST_material.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 2048,
          accessLevel: AccessLevel.PRO,
          isPublished: false,
        },
      });

      await tx.material.upsert({
        where: { id: IDS.materialVideo },
        update: {
          subjectId: IDS.scienceSubject,
          title: 'TEST_Material_Embedded_Video',
          materialType: MaterialType.EMBEDDED_VIDEO,
          storageUrl: null,
          embedUrl: 'https://example.com/test-video',
          originalFileName: null,
          mimeType: null,
          fileSizeBytes: null,
          accessLevel: AccessLevel.PRO,
          isPublished: true,
          publishedAt: PUBLISHED_AT,
        },
        create: {
          id: IDS.materialVideo,
          subjectId: IDS.scienceSubject,
          title: 'TEST_Material_Embedded_Video',
          materialType: MaterialType.EMBEDDED_VIDEO,
          embedUrl: 'https://example.com/test-video',
          accessLevel: AccessLevel.PRO,
          isPublished: true,
          publishedAt: PUBLISHED_AT,
        },
      });

      await tx.exam.upsert({
        where: { id: IDS.draftExam },
        update: {
          subjectId: IDS.mathSubject,
          title: 'TEST_Exam_Draft_Free',
          description: 'Draft exam for Admin API tests',
          status: ExamStatus.DRAFT,
          accessLevel: AccessLevel.FREE,
          displayOrder: 1,
          publishedAt: null,
          deletedAt: null,
        },
        create: {
          id: IDS.draftExam,
          subjectId: IDS.mathSubject,
          title: 'TEST_Exam_Draft_Free',
          description: 'Draft exam for Admin API tests',
          status: ExamStatus.DRAFT,
          accessLevel: AccessLevel.FREE,
          displayOrder: 1,
          publishedAt: null,
          deletedAt: null,
        },
      });

      await tx.exam.upsert({
        where: { id: IDS.freeExam },
        update: {
          subjectId: IDS.mathSubject,
          title: 'TEST_Exam_Published_Free',
          description: 'Published free exam for Student API tests',
          status: ExamStatus.PUBLISHED,
          accessLevel: AccessLevel.FREE,
          displayOrder: 2,
          publishedAt: PUBLISHED_AT,
          deletedAt: null,
        },
        create: {
          id: IDS.freeExam,
          subjectId: IDS.mathSubject,
          title: 'TEST_Exam_Published_Free',
          description: 'Published free exam for Student API tests',
          status: ExamStatus.PUBLISHED,
          accessLevel: AccessLevel.FREE,
          displayOrder: 2,
          publishedAt: PUBLISHED_AT,
          deletedAt: null,
        },
      });

      await tx.exam.upsert({
        where: { id: IDS.proExam },
        update: {
          subjectId: IDS.scienceSubject,
          title: 'TEST_Exam_Published_Pro',
          description: 'Published Pro exam for access-level tests',
          status: ExamStatus.PUBLISHED,
          accessLevel: AccessLevel.PRO,
          displayOrder: 3,
          publishedAt: PUBLISHED_AT,
          deletedAt: null,
        },
        create: {
          id: IDS.proExam,
          subjectId: IDS.scienceSubject,
          title: 'TEST_Exam_Published_Pro',
          description: 'Published Pro exam for access-level tests',
          status: ExamStatus.PUBLISHED,
          accessLevel: AccessLevel.PRO,
          displayOrder: 3,
          publishedAt: PUBLISHED_AT,
          deletedAt: null,
        },
      });

      await tx.question.upsert({
        where: { id: IDS.multipleChoiceQuestion },
        update: {
          examId: IDS.freeExam,
          questionType: QuestionType.MULTIPLE_CHOICE,
          contentText: 'TEST_Which city is the capital of France?',
          imageUrl: null,
          instruction: 'TEST_Select one option',
          explaination: 'TEST_Paris is the capital of France.',
          timeLimitSeconds: 60,
          correctTextAnswer: null,
          position: 0,
          deletedAt: null,
        },
        create: {
          id: IDS.multipleChoiceQuestion,
          examId: IDS.freeExam,
          questionType: QuestionType.MULTIPLE_CHOICE,
          contentText: 'TEST_Which city is the capital of France?',
          instruction: 'TEST_Select one option',
          explaination: 'TEST_Paris is the capital of France.',
          timeLimitSeconds: 60,
          position: 0,
        },
      });

      await tx.question.upsert({
        where: { id: IDS.shortAnswerQuestion },
        update: {
          examId: IDS.freeExam,
          questionType: QuestionType.SHORT_ANSWER,
          contentText: 'TEST_Write the capital of Vietnam.',
          imageUrl: null,
          instruction: 'TEST_Use a short text answer',
          explaination: 'TEST_Hà Nội is the capital of Vietnam.',
          timeLimitSeconds: 90,
          correctTextAnswer: 'Hà Nội',
          position: 1,
          deletedAt: null,
        },
        create: {
          id: IDS.shortAnswerQuestion,
          examId: IDS.freeExam,
          questionType: QuestionType.SHORT_ANSWER,
          contentText: 'TEST_Write the capital of Vietnam.',
          instruction: 'TEST_Use a short text answer',
          explaination: 'TEST_Hà Nội is the capital of Vietnam.',
          timeLimitSeconds: 90,
          correctTextAnswer: 'Hà Nội',
          position: 1,
        },
      });

      await tx.question.upsert({
        where: { id: IDS.proQuestion },
        update: {
          examId: IDS.proExam,
          questionType: QuestionType.MULTIPLE_CHOICE,
          contentText: 'TEST_Which planet is known as the Red Planet?',
          imageUrl: null,
          instruction: 'TEST_Select one option',
          explaination: 'TEST_Mars is known as the Red Planet.',
          timeLimitSeconds: 60,
          correctTextAnswer: null,
          position: 0,
          deletedAt: null,
        },
        create: {
          id: IDS.proQuestion,
          examId: IDS.proExam,
          questionType: QuestionType.MULTIPLE_CHOICE,
          contentText: 'TEST_Which planet is known as the Red Planet?',
          instruction: 'TEST_Select one option',
          explaination: 'TEST_Mars is known as the Red Planet.',
          timeLimitSeconds: 60,
          position: 0,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionParis },
        update: {
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Paris',
          isCorrect: true,
          position: 0,
        },
        create: {
          id: IDS.optionParis,
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Paris',
          isCorrect: true,
          position: 0,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionLondon },
        update: {
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_London',
          isCorrect: false,
          position: 1,
        },
        create: {
          id: IDS.optionLondon,
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_London',
          isCorrect: false,
          position: 1,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionRome },
        update: {
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Rome',
          isCorrect: false,
          position: 2,
        },
        create: {
          id: IDS.optionRome,
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Rome',
          isCorrect: false,
          position: 2,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionMadrid },
        update: {
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Madrid',
          isCorrect: false,
          position: 3,
        },
        create: {
          id: IDS.optionMadrid,
          questionId: IDS.multipleChoiceQuestion,
          contentText: 'TEST_Madrid',
          isCorrect: false,
          position: 3,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionMars },
        update: {
          questionId: IDS.proQuestion,
          contentText: 'TEST_Mars',
          isCorrect: true,
          position: 0,
        },
        create: {
          id: IDS.optionMars,
          questionId: IDS.proQuestion,
          contentText: 'TEST_Mars',
          isCorrect: true,
          position: 0,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionJupiter },
        update: {
          questionId: IDS.proQuestion,
          contentText: 'TEST_Jupiter',
          isCorrect: false,
          position: 1,
        },
        create: {
          id: IDS.optionJupiter,
          questionId: IDS.proQuestion,
          contentText: 'TEST_Jupiter',
          isCorrect: false,
          position: 1,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionVenus },
        update: {
          questionId: IDS.proQuestion,
          contentText: 'TEST_Venus',
          isCorrect: false,
          position: 2,
        },
        create: {
          id: IDS.optionVenus,
          questionId: IDS.proQuestion,
          contentText: 'TEST_Venus',
          isCorrect: false,
          position: 2,
        },
      });

      await tx.questionOption.upsert({
        where: { id: IDS.optionMercury },
        update: {
          questionId: IDS.proQuestion,
          contentText: 'TEST_Mercury',
          isCorrect: false,
          position: 3,
        },
        create: {
          id: IDS.optionMercury,
          questionId: IDS.proQuestion,
          contentText: 'TEST_Mercury',
          isCorrect: false,
          position: 3,
        },
      });

      await tx.questionAcceptedAnswer.upsert({
        where: { id: IDS.shortAnswerAccepted },
        update: {
          questionId: IDS.shortAnswerQuestion,
          answerType: AnswerValueType.TEXT,
          rawValue: 'Hà Nội',
          isPrimary: true,
          normalizedText: 'hà nội',
          content: 'TEST_Primary accepted answer',
          isCorrect: true,
          position: 0,
          numericValue: null,
        },
        create: {
          id: IDS.shortAnswerAccepted,
          questionId: IDS.shortAnswerQuestion,
          answerType: AnswerValueType.TEXT,
          rawValue: 'Hà Nội',
          isPrimary: true,
          normalizedText: 'hà nội',
          content: 'TEST_Primary accepted answer',
          isCorrect: true,
          position: 0,
        },
      });

      await tx.examAssignment.upsert({
        where: { id: IDS.assignment },
        update: {
          userId: IDS.freeStudent,
          examId: IDS.freeExam,
          assignedAt: PUBLISHED_AT,
          dueAt: DUE_AT,
        },
        create: {
          id: IDS.assignment,
          userId: IDS.freeStudent,
          examId: IDS.freeExam,
          assignedAt: PUBLISHED_AT,
          dueAt: DUE_AT,
        },
      });

      await tx.examAttempt.upsert({
        where: { id: IDS.inProgressAttempt },
        update: {
          userId: IDS.proStudent,
          examId: IDS.proExam,
          assignmentId: null,
          status: AttemptStatus.IN_PROGRESS,
          submittedAt: null,
          correctCount: 0,
          totalQuestions: 1,
          startedAt: STARTED_AT,
        },
        create: {
          id: IDS.inProgressAttempt,
          userId: IDS.proStudent,
          examId: IDS.proExam,
          status: AttemptStatus.IN_PROGRESS,
          correctCount: 0,
          totalQuestions: 1,
          startedAt: STARTED_AT,
        },
      });

      await tx.examAttempt.upsert({
        where: { id: IDS.completedAttempt },
        update: {
          userId: IDS.freeStudent,
          examId: IDS.freeExam,
          assignmentId: IDS.assignment,
          status: AttemptStatus.COMPLETED,
          submittedAt: SUBMITTED_AT,
          correctCount: 2,
          totalQuestions: 2,
          startedAt: STARTED_AT,
        },
        create: {
          id: IDS.completedAttempt,
          userId: IDS.freeStudent,
          examId: IDS.freeExam,
          assignmentId: IDS.assignment,
          status: AttemptStatus.COMPLETED,
          submittedAt: SUBMITTED_AT,
          correctCount: 2,
          totalQuestions: 2,
          startedAt: STARTED_AT,
        },
      });

      await tx.attemptAnswer.upsert({
        where: { id: IDS.completedFreeMcAnswer },
        update: {
          attemptId: IDS.completedAttempt,
          questionId: IDS.multipleChoiceQuestion,
          selectedOptionId: IDS.optionParis,
          answerType: AnswerValueType.TEXT,
          rawValue: 'TEST_Paris',
          normalizedText: 'test_paris',
          content: null,
          isCorrect: true,
          position: 0,
          numericValue: null,
        },
        create: {
          id: IDS.completedFreeMcAnswer,
          attemptId: IDS.completedAttempt,
          questionId: IDS.multipleChoiceQuestion,
          selectedOptionId: IDS.optionParis,
          answerType: AnswerValueType.TEXT,
          rawValue: 'TEST_Paris',
          normalizedText: 'test_paris',
          isCorrect: true,
          position: 0,
        },
      });

      await tx.attemptAnswer.upsert({
        where: { id: IDS.completedShortAnswer },
        update: {
          attemptId: IDS.completedAttempt,
          questionId: IDS.shortAnswerQuestion,
          selectedOptionId: null,
          answerType: AnswerValueType.TEXT,
          rawValue: 'Hà Nội',
          normalizedText: 'hà nội',
          content: 'TEST_Short answer',
          isCorrect: true,
          position: 1,
          numericValue: null,
        },
        create: {
          id: IDS.completedShortAnswer,
          attemptId: IDS.completedAttempt,
          questionId: IDS.shortAnswerQuestion,
          answerType: AnswerValueType.TEXT,
          rawValue: 'Hà Nội',
          normalizedText: 'hà nội',
          content: 'TEST_Short answer',
          isCorrect: true,
          position: 1,
        },
      });
    }, {
      maxWait: 30_000,
      timeout: 120_000,
    });

    console.log('TEST seed completed. Passwords were read from environment variables.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`TEST seed failed: ${message}`);
  process.exitCode = 1;
});
