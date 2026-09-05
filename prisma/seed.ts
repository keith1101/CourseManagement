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
  users: {
    admin: '11111111-1111-4111-8111-111111111111',
    freeStudent: '22222222-2222-4222-8222-222222222222',
    proStudent: '33333333-3333-4333-8333-333333333333',
    inactiveStudent: '44444444-4444-4444-8444-444444444444',
  },
  subscriptions: {
    proStudent: '55555555-5555-4555-8555-555555555555',
  },
  subjects: {
    math: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    science: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    history: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    geography: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    english: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
    vietnamese: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  },
  materials: {
    mathPdf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    sciencePdf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    historyDocx: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    geographyPdf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
    englishVideo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
    vietnamesePdf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',
  },
  exams: {
    mathFree: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    englishFree: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    sciencePro: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    vietnameseDraft: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
  },
  questions: {
    mathFraction: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    mathEquation: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    mathRectangle: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
    englishVocabulary: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    englishGrammar: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5',
    sciencePhotosynthesis: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd6',
    scienceBoilingPoint: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd7',
    vietnameseSynonym: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd8',
  },
  options: {
    mathFractionA: 'e1111111-1111-4111-8111-111111111111',
    mathFractionB: 'e1111111-1111-4111-8111-111111111112',
    mathFractionC: 'e1111111-1111-4111-8111-111111111113',
    mathFractionD: 'e1111111-1111-4111-8111-111111111114',

    mathEquationA: 'e2222222-2222-4222-8222-222222222221',
    mathEquationB: 'e2222222-2222-4222-8222-222222222222',
    mathEquationC: 'e2222222-2222-4222-8222-222222222223',
    mathEquationD: 'e2222222-2222-4222-8222-222222222224',

    englishVocabularyA: 'e3333333-3333-4333-8333-333333333331',
    englishVocabularyB: 'e3333333-3333-4333-8333-333333333332',
    englishVocabularyC: 'e3333333-3333-4333-8333-333333333333',
    englishVocabularyD: 'e3333333-3333-4333-8333-333333333334',

    englishGrammarA: 'e4444444-4444-4444-8444-444444444441',
    englishGrammarB: 'e4444444-4444-4444-8444-444444444442',
    englishGrammarC: 'e4444444-4444-4444-8444-444444444443',
    englishGrammarD: 'e4444444-4444-4444-8444-444444444444',

    sciencePhotosynthesisA: 'e5555555-5555-4555-8555-555555555551',
    sciencePhotosynthesisB: 'e5555555-5555-4555-8555-555555555552',
    sciencePhotosynthesisC: 'e5555555-5555-4555-8555-555555555553',
    sciencePhotosynthesisD: 'e5555555-5555-4555-8555-555555555554',
  },
  acceptedAnswers: {
    mathRectangle: 'f1111111-1111-4111-8111-111111111111',
    scienceBoilingPoint: 'f2222222-2222-4222-8222-222222222222',
    vietnameseSynonym: 'f3333333-3333-4333-8333-333333333333',
  },
  assignments: {
    mathForFreeStudent: 'f4444444-4444-4444-8444-444444444444',
    overdueEnglishForFreeStudent: 'f5555555-5555-4555-8555-555555555555',
    scienceForProStudent: 'f6666666-6666-4666-8666-666666666666',
  },
  attempts: {
    completedMath: 'f7777777-7777-4777-8777-777777777777',
    inProgressScience: 'f8888888-8888-4888-8888-888888888888',
  },
  attemptAnswers: {
    mathFraction: 'f9999999-9999-4999-8999-999999999991',
    mathEquation: 'f9999999-9999-4999-8999-999999999992',
    mathRectangle: 'f9999999-9999-4999-8999-999999999993',
  },
} as const;

const DATES = {
  publishedAt: new Date('2026-08-15T00:00:00.000Z'),
  subscriptionStartedAt: new Date('2026-09-01T00:00:00.000Z'),
  proExpiresAt: new Date('2027-09-01T00:00:00.000Z'),
  assignmentAssignedAt: new Date('2026-08-25T00:00:00.000Z'),
  assignmentDueAt: new Date('2026-09-30T16:59:59.000Z'),
  overdueDueAt: new Date('2026-09-01T16:59:59.000Z'),
  attemptStartedAt: new Date('2026-09-03T08:00:00.000Z'),
  attemptSubmittedAt: new Date('2026-09-03T08:07:30.000Z'),
} as const;

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
  const { adminPassword, studentPassword, connectionString } = readSeedConfig();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const [adminPasswordHash, studentPasswordHash] = await Promise.all([
      bcrypt.hash(adminPassword, 10),
      bcrypt.hash(studentPassword, 10),
    ]);

    await prisma.$transaction(
      async (tx) => {
        // ---------------------------------------------------------------------
        // Users
        // ---------------------------------------------------------------------
        const users = [
          {
            id: IDS.users.admin,
            fullName: 'Nguyễn Minh Anh',
            email: 'admin@coursemanagement.local',
            phone: '+84901234567',
            dateOfBirth: new Date('1992-05-15T00:00:00.000Z'),
            passwordHash: adminPasswordHash,
            role: UserRole.ADMIN,
            isActive: true,
            accessLevel: AccessLevel.FREE,
            proExpiresAt: null,
          },
          {
            id: IDS.users.freeStudent,
            fullName: 'Trần Gia Huy',
            email: 'student.free@coursemanagement.local',
            phone: '+84912345678',
            dateOfBirth: new Date('2011-03-12T00:00:00.000Z'),
            passwordHash: studentPasswordHash,
            role: UserRole.STUDENT,
            isActive: true,
            accessLevel: AccessLevel.FREE,
            proExpiresAt: null,
          },
          {
            id: IDS.users.proStudent,
            fullName: 'Lê Khánh Linh',
            email: 'student.pro@coursemanagement.local',
            phone: '+84923456789',
            dateOfBirth: new Date('2011-08-21T00:00:00.000Z'),
            passwordHash: studentPasswordHash,
            role: UserRole.STUDENT,
            isActive: true,
            accessLevel: AccessLevel.PRO,
            proExpiresAt: DATES.proExpiresAt,
          },
          {
            id: IDS.users.inactiveStudent,
            fullName: 'Phạm Quốc Bảo',
            email: 'student.locked@coursemanagement.local',
            phone: '+84934567890',
            dateOfBirth: new Date('2010-11-05T00:00:00.000Z'),
            passwordHash: studentPasswordHash,
            role: UserRole.STUDENT,
            isActive: false,
            accessLevel: AccessLevel.FREE,
            proExpiresAt: null,
          },
        ] as const;

        for (const user of users) {
          await tx.user.upsert({
            where: { id: user.id },
            update: { ...user, lastLoginAt: null },
            create: user,
          });
        }

        await tx.subscription.upsert({
          where: { id: IDS.subscriptions.proStudent },
          update: {
            userId: IDS.users.proStudent,
            startedAt: DATES.subscriptionStartedAt,
            expiresAt: DATES.proExpiresAt,
            revokedAt: null,
          },
          create: {
            id: IDS.subscriptions.proStudent,
            userId: IDS.users.proStudent,
            startedAt: DATES.subscriptionStartedAt,
            expiresAt: DATES.proExpiresAt,
          },
        });

        // ---------------------------------------------------------------------
        // Subjects - đúng 6 môn trong phạm vi MVP
        // ---------------------------------------------------------------------
        const subjects = [
          {
            id: IDS.subjects.math,
            code: 'MATH',
            name: 'Toán',
            description: 'Kiến thức Toán học và bài tập luyện thi.',
            displayOrder: 1,
            isActive: true,
          },
          {
            id: IDS.subjects.science,
            code: 'SCIENCE',
            name: 'Khoa học tự nhiên',
            description: 'Kiến thức Vật lý, Hóa học và Sinh học cơ bản.',
            displayOrder: 2,
            isActive: true,
          },
          {
            id: IDS.subjects.history,
            code: 'HISTORY',
            name: 'Lịch sử',
            description: 'Các chủ đề lịch sử Việt Nam và thế giới.',
            displayOrder: 3,
            isActive: true,
          },
          {
            id: IDS.subjects.geography,
            code: 'GEOGRAPHY',
            name: 'Địa lý',
            description: 'Địa lý tự nhiên, dân cư và kinh tế.',
            displayOrder: 4,
            isActive: true,
          },
          {
            id: IDS.subjects.english,
            code: 'ENGLISH',
            name: 'Tiếng Anh',
            description: 'Từ vựng, ngữ pháp và kỹ năng đọc hiểu.',
            displayOrder: 5,
            isActive: true,
          },
          {
            id: IDS.subjects.vietnamese,
            code: 'VIETNAMESE',
            name: 'Tiếng Việt',
            description: 'Từ vựng, ngữ pháp và đọc hiểu tiếng Việt.',
            displayOrder: 6,
            isActive: true,
          },
        ] as const;

        for (const subject of subjects) {
          await tx.subject.upsert({
            where: { id: subject.id },
            update: subject,
            create: subject,
          });
        }

        // ---------------------------------------------------------------------
        // Learning materials
        // Các storageUrl dưới đây là đường dẫn demo có cấu trúc gần với production.
        // ---------------------------------------------------------------------
        const materials = [
          {
            id: IDS.materials.mathPdf,
            subjectId: IDS.subjects.math,
            title: 'Ôn tập phân số và phương trình cơ bản',
            materialType: MaterialType.PDF,
            storageUrl:
              'https://storage.googleapis.com/course-management-materials/math/on-tap-phan-so-va-phuong-trinh.pdf',
            embedUrl: null,
            originalFileName: 'on-tap-phan-so-va-phuong-trinh.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1_845_120,
            accessLevel: AccessLevel.FREE,
            isPublished: true,
            publishedAt: DATES.publishedAt,
          },
          {
            id: IDS.materials.sciencePdf,
            subjectId: IDS.subjects.science,
            title: 'Chuyên đề quang hợp và trao đổi chất',
            materialType: MaterialType.PDF,
            storageUrl:
              'https://storage.googleapis.com/course-management-materials/science/quang-hop-va-trao-doi-chat.pdf',
            embedUrl: null,
            originalFileName: 'quang-hop-va-trao-doi-chat.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 2_621_440,
            accessLevel: AccessLevel.PRO,
            isPublished: true,
            publishedAt: DATES.publishedAt,
          },
          {
            id: IDS.materials.historyDocx,
            subjectId: IDS.subjects.history,
            title: 'Mốc thời gian lịch sử Việt Nam thế kỷ XX',
            materialType: MaterialType.DOCX,
            storageUrl:
              'https://storage.googleapis.com/course-management-materials/history/moc-thoi-gian-lich-su-viet-nam.docx',
            embedUrl: null,
            originalFileName: 'moc-thoi-gian-lich-su-viet-nam.docx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            fileSizeBytes: 824_320,
            accessLevel: AccessLevel.PRO,
            isPublished: true,
            publishedAt: DATES.publishedAt,
          },
          {
            id: IDS.materials.geographyPdf,
            subjectId: IDS.subjects.geography,
            title: 'Bản đồ các vùng kinh tế Việt Nam',
            materialType: MaterialType.PDF,
            storageUrl:
              'https://storage.googleapis.com/course-management-materials/geography/cac-vung-kinh-te-viet-nam.pdf',
            embedUrl: null,
            originalFileName: 'cac-vung-kinh-te-viet-nam.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 3_145_728,
            accessLevel: AccessLevel.FREE,
            isPublished: true,
            publishedAt: DATES.publishedAt,
          },
          {
            id: IDS.materials.englishVideo,
            subjectId: IDS.subjects.english,
            title: 'Video ôn tập thì hiện tại hoàn thành',
            materialType: MaterialType.EMBEDDED_VIDEO,
            storageUrl: null,
            embedUrl: 'https://www.youtube.com/embed/placeholder-present-perfect',
            originalFileName: null,
            mimeType: null,
            fileSizeBytes: null,
            accessLevel: AccessLevel.FREE,
            isPublished: true,
            publishedAt: DATES.publishedAt,
          },
          {
            id: IDS.materials.vietnamesePdf,
            subjectId: IDS.subjects.vietnamese,
            title: 'Ôn tập từ đồng nghĩa và trái nghĩa',
            materialType: MaterialType.PDF,
            storageUrl:
              'https://storage.googleapis.com/course-management-materials/vietnamese/tu-dong-nghia-trai-nghia.pdf',
            embedUrl: null,
            originalFileName: 'tu-dong-nghia-trai-nghia.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1_126_400,
            accessLevel: AccessLevel.PRO,
            isPublished: false,
            publishedAt: null,
          },
        ] as const;

        for (const material of materials) {
          await tx.material.upsert({
            where: { id: material.id },
            update: material,
            create: material,
          });
        }

        // ---------------------------------------------------------------------
        // Exams
        // Lưu ý: schema hiện tại không có subjectId ở Exam; môn học nằm ở Question.
        // ---------------------------------------------------------------------
        const exams = [
          {
            id: IDS.exams.mathFree,
            title: 'Đề 1 - Toán cơ bản',
            description:
              'Đề miễn phí kiểm tra kiến thức phân số, phương trình và hình học cơ bản.',
            status: ExamStatus.PUBLISHED,
            accessLevel: AccessLevel.FREE,
            displayOrder: 1,
            publishedAt: DATES.publishedAt,
            deletedAt: null,
          },
          {
            id: IDS.exams.englishFree,
            title: 'Đề 2 - Tiếng Anh cơ bản',
            description:
              'Đề miễn phí luyện từ vựng và ngữ pháp tiếng Anh cơ bản.',
            status: ExamStatus.PUBLISHED,
            accessLevel: AccessLevel.FREE,
            displayOrder: 2,
            publishedAt: DATES.publishedAt,
            deletedAt: null,
          },
          {
            id: IDS.exams.sciencePro,
            title: 'Đề 3 - Khoa học tự nhiên nâng cao',
            description:
              'Đề dành cho tài khoản Pro, tập trung vào Sinh học và kiến thức khoa học cơ bản.',
            status: ExamStatus.PUBLISHED,
            accessLevel: AccessLevel.PRO,
            displayOrder: 3,
            publishedAt: DATES.publishedAt,
            deletedAt: null,
          },
          {
            id: IDS.exams.vietnameseDraft,
            title: 'Tiếng Việt - Đề đang biên soạn',
            description:
              'Bản nháp dùng để kiểm thử luồng Admin tạo và chỉnh sửa đề.',
            status: ExamStatus.DRAFT,
            accessLevel: AccessLevel.FREE,
            displayOrder: 4,
            publishedAt: null,
            deletedAt: null,
          },
        ] as const;

        for (const exam of exams) {
          await tx.exam.upsert({
            where: { id: exam.id },
            update: exam,
            create: exam,
          });
        }

        // ---------------------------------------------------------------------
        // Questions
        // ---------------------------------------------------------------------
        const questions = [
          {
            id: IDS.questions.mathFraction,
            examId: IDS.exams.mathFree,
            subjectId: IDS.subjects.math,
            questionType: QuestionType.MULTIPLE_CHOICE,
            contentText: 'Phân số nào bằng 1/2?',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Có thể rút gọn tử số và mẫu số cùng một số.',
            instruction: 'Chọn một đáp án đúng.',
            explaination: '2/4 rút gọn cả tử và mẫu cho 2 sẽ được 1/2.',
            explanationImageUrl: null,
            timeLimitSeconds: 180,
            correctTextAnswer: null,
            position: 0,
            deletedAt: null,
          },
          {
            id: IDS.questions.mathEquation,
            examId: IDS.exams.mathFree,
            subjectId: IDS.subjects.math,
            questionType: QuestionType.MULTIPLE_CHOICE,
            contentText: 'Nghiệm của phương trình 2x + 6 = 14 là bao nhiêu?',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Chuyển 6 sang vế phải rồi chia hai vế cho 2.',
            instruction: 'Chọn một đáp án đúng.',
            explaination: '2x = 8 nên x = 4.',
            explanationImageUrl: null,
            timeLimitSeconds: 180,
            correctTextAnswer: null,
            position: 1,
            deletedAt: null,
          },
          {
            id: IDS.questions.mathRectangle,
            examId: IDS.exams.mathFree,
            subjectId: IDS.subjects.math,
            questionType: QuestionType.SHORT_ANSWER,
            contentText:
              'Một hình chữ nhật có chiều dài 5 cm và chiều rộng 3 cm. Chu vi bằng bao nhiêu cm?',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Chu vi hình chữ nhật bằng 2 × (chiều dài + chiều rộng).',
            instruction: 'Nhập đáp số bằng số.',
            explaination: 'P = 2 × (5 + 3) = 16 cm.',
            explanationImageUrl: null,
            timeLimitSeconds: 300,
            correctTextAnswer: '16',
            position: 2,
            deletedAt: null,
          },
          {
            id: IDS.questions.englishVocabulary,
            examId: IDS.exams.englishFree,
            subjectId: IDS.subjects.english,
            questionType: QuestionType.MULTIPLE_CHOICE,
            contentText: 'Choose the word closest in meaning to “rapid”.',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Think about a word that describes high speed.',
            instruction: 'Choose one correct answer.',
            explaination: '“Rapid” means happening or moving very quickly.',
            explanationImageUrl: null,
            timeLimitSeconds: 180,
            correctTextAnswer: null,
            position: 0,
            deletedAt: null,
          },
          {
            id: IDS.questions.englishGrammar,
            examId: IDS.exams.englishFree,
            subjectId: IDS.subjects.english,
            questionType: QuestionType.MULTIPLE_CHOICE,
            contentText: 'She ___ in Ho Chi Minh City since 2022.',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'The phrase “since 2022” commonly goes with the present perfect.',
            instruction: 'Choose one correct answer.',
            explaination:
              'The present perfect is used for an action that started in the past and continues to the present.',
            explanationImageUrl: null,
            timeLimitSeconds: 180,
            correctTextAnswer: null,
            position: 1,
            deletedAt: null,
          },
          {
            id: IDS.questions.sciencePhotosynthesis,
            examId: IDS.exams.sciencePro,
            subjectId: IDS.subjects.science,
            questionType: QuestionType.MULTIPLE_CHOICE,
            contentText: 'Cơ quan nào của cây thực hiện quang hợp chủ yếu?',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Bộ phận này thường chứa nhiều diệp lục.',
            instruction: 'Chọn một đáp án đúng.',
            explaination:
              'Lá chứa nhiều lục lạp và là cơ quan thực hiện quang hợp chủ yếu của cây.',
            explanationImageUrl: null,
            timeLimitSeconds: 180,
            correctTextAnswer: null,
            position: 0,
            deletedAt: null,
          },
          {
            id: IDS.questions.scienceBoilingPoint,
            examId: IDS.exams.sciencePro,
            subjectId: IDS.subjects.science,
            questionType: QuestionType.SHORT_ANSWER,
            contentText:
              'Ở áp suất khí quyển tiêu chuẩn, nước tinh khiết sôi ở bao nhiêu độ C?',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Đây là một mốc nhiệt độ rất quen thuộc.',
            instruction: 'Nhập nhiệt độ bằng số, không cần nhập ký hiệu °C.',
            explaination:
              'Ở áp suất khí quyển tiêu chuẩn, nước tinh khiết sôi ở 100 °C.',
            explanationImageUrl: null,
            timeLimitSeconds: 300,
            correctTextAnswer: '100',
            position: 1,
            deletedAt: null,
          },
          {
            id: IDS.questions.vietnameseSynonym,
            examId: IDS.exams.vietnameseDraft,
            subjectId: IDS.subjects.vietnamese,
            questionType: QuestionType.SHORT_ANSWER,
            contentText: 'Hãy viết một từ đồng nghĩa với từ “chăm chỉ”.',
            imageUrl: null,
            hintImageUrl: null,
            hint: 'Có thể dùng một từ mô tả người làm việc đều đặn và chịu khó.',
            instruction: 'Nhập một từ hoặc cụm từ ngắn.',
            explaination:
              'Một số đáp án phù hợp gồm “siêng năng” hoặc “cần cù”.',
            explanationImageUrl: null,
            timeLimitSeconds: 300,
            correctTextAnswer: 'siêng năng',
            position: 0,
            deletedAt: null,
          },
        ] as const;

        for (const question of questions) {
          await tx.question.upsert({
            where: { id: question.id },
            update: question,
            create: question,
          });
        }

        // ---------------------------------------------------------------------
        // Multiple-choice options
        // ---------------------------------------------------------------------
        const options = [
          {
            id: IDS.options.mathFractionA,
            questionId: IDS.questions.mathFraction,
            contentText: '2/4',
            imageUrl: null,
            isCorrect: true,
            position: 0,
          },
          {
            id: IDS.options.mathFractionB,
            questionId: IDS.questions.mathFraction,
            contentText: '2/3',
            imageUrl: null,
            isCorrect: false,
            position: 1,
          },
          {
            id: IDS.options.mathFractionC,
            questionId: IDS.questions.mathFraction,
            contentText: '3/4',
            imageUrl: null,
            isCorrect: false,
            position: 2,
          },
          {
            id: IDS.options.mathFractionD,
            questionId: IDS.questions.mathFraction,
            contentText: '4/5',
            imageUrl: null,
            isCorrect: false,
            position: 3,
          },
          {
            id: IDS.options.mathEquationA,
            questionId: IDS.questions.mathEquation,
            contentText: '2',
            imageUrl: null,
            isCorrect: false,
            position: 0,
          },
          {
            id: IDS.options.mathEquationB,
            questionId: IDS.questions.mathEquation,
            contentText: '4',
            imageUrl: null,
            isCorrect: true,
            position: 1,
          },
          {
            id: IDS.options.mathEquationC,
            questionId: IDS.questions.mathEquation,
            contentText: '6',
            imageUrl: null,
            isCorrect: false,
            position: 2,
          },
          {
            id: IDS.options.mathEquationD,
            questionId: IDS.questions.mathEquation,
            contentText: '8',
            imageUrl: null,
            isCorrect: false,
            position: 3,
          },
          {
            id: IDS.options.englishVocabularyA,
            questionId: IDS.questions.englishVocabulary,
            contentText: 'slow',
            imageUrl: null,
            isCorrect: false,
            position: 0,
          },
          {
            id: IDS.options.englishVocabularyB,
            questionId: IDS.questions.englishVocabulary,
            contentText: 'quick',
            imageUrl: null,
            isCorrect: true,
            position: 1,
          },
          {
            id: IDS.options.englishVocabularyC,
            questionId: IDS.questions.englishVocabulary,
            contentText: 'quiet',
            imageUrl: null,
            isCorrect: false,
            position: 2,
          },
          {
            id: IDS.options.englishVocabularyD,
            questionId: IDS.questions.englishVocabulary,
            contentText: 'weak',
            imageUrl: null,
            isCorrect: false,
            position: 3,
          },
          {
            id: IDS.options.englishGrammarA,
            questionId: IDS.questions.englishGrammar,
            contentText: 'lives',
            imageUrl: null,
            isCorrect: false,
            position: 0,
          },
          {
            id: IDS.options.englishGrammarB,
            questionId: IDS.questions.englishGrammar,
            contentText: 'lived',
            imageUrl: null,
            isCorrect: false,
            position: 1,
          },
          {
            id: IDS.options.englishGrammarC,
            questionId: IDS.questions.englishGrammar,
            contentText: 'has lived',
            imageUrl: null,
            isCorrect: true,
            position: 2,
          },
          {
            id: IDS.options.englishGrammarD,
            questionId: IDS.questions.englishGrammar,
            contentText: 'is living',
            imageUrl: null,
            isCorrect: false,
            position: 3,
          },
          {
            id: IDS.options.sciencePhotosynthesisA,
            questionId: IDS.questions.sciencePhotosynthesis,
            contentText: 'Rễ',
            imageUrl: null,
            isCorrect: false,
            position: 0,
          },
          {
            id: IDS.options.sciencePhotosynthesisB,
            questionId: IDS.questions.sciencePhotosynthesis,
            contentText: 'Thân',
            imageUrl: null,
            isCorrect: false,
            position: 1,
          },
          {
            id: IDS.options.sciencePhotosynthesisC,
            questionId: IDS.questions.sciencePhotosynthesis,
            contentText: 'Lá',
            imageUrl: null,
            isCorrect: true,
            position: 2,
          },
          {
            id: IDS.options.sciencePhotosynthesisD,
            questionId: IDS.questions.sciencePhotosynthesis,
            contentText: 'Hoa',
            imageUrl: null,
            isCorrect: false,
            position: 3,
          },
        ] as const;

        for (const option of options) {
          await tx.questionOption.upsert({
            where: { id: option.id },
            update: option,
            create: option,
          });
        }

        // ---------------------------------------------------------------------
        // Accepted answers for SHORT_ANSWER
        // ---------------------------------------------------------------------
        const acceptedAnswers = [
          {
            id: IDS.acceptedAnswers.mathRectangle,
            questionId: IDS.questions.mathRectangle,
            answerType: AnswerValueType.NUMBER,
            rawValue: '16',
            isPrimary: true,
            normalizedText: null,
            content: 'Chu vi hình chữ nhật là 16 cm.',
            isCorrect: true,
            position: 0,
            numericValue: 16,
          },
          {
            id: IDS.acceptedAnswers.scienceBoilingPoint,
            questionId: IDS.questions.scienceBoilingPoint,
            answerType: AnswerValueType.NUMBER,
            rawValue: '100',
            isPrimary: true,
            normalizedText: null,
            content: 'Nước sôi ở 100 °C trong điều kiện áp suất tiêu chuẩn.',
            isCorrect: true,
            position: 0,
            numericValue: 100,
          },
          {
            id: IDS.acceptedAnswers.vietnameseSynonym,
            questionId: IDS.questions.vietnameseSynonym,
            answerType: AnswerValueType.TEXT,
            rawValue: 'siêng năng',
            isPrimary: true,
            normalizedText: 'siêng năng',
            content: 'Một từ đồng nghĩa phù hợp với “chăm chỉ”.',
            isCorrect: true,
            position: 0,
            numericValue: null,
          },
        ] as const;

        for (const answer of acceptedAnswers) {
          await tx.questionAcceptedAnswer.upsert({
            where: { id: answer.id },
            update: answer,
            create: answer,
          });
        }

        // ---------------------------------------------------------------------
        // Assignments
        // - 1 assignment còn hạn
        // - 1 assignment đã quá hạn và chưa làm
        // - 1 assignment Pro
        // ---------------------------------------------------------------------
        const assignments = [
          {
            id: IDS.assignments.mathForFreeStudent,
            userId: IDS.users.freeStudent,
            examId: IDS.exams.mathFree,
            assignedAt: DATES.assignmentAssignedAt,
            dueAt: DATES.assignmentDueAt,
          },
          {
            id: IDS.assignments.overdueEnglishForFreeStudent,
            userId: IDS.users.freeStudent,
            examId: IDS.exams.englishFree,
            assignedAt: DATES.assignmentAssignedAt,
            dueAt: DATES.overdueDueAt,
          },
          {
            id: IDS.assignments.scienceForProStudent,
            userId: IDS.users.proStudent,
            examId: IDS.exams.sciencePro,
            assignedAt: DATES.assignmentAssignedAt,
            dueAt: DATES.assignmentDueAt,
          },
        ] as const;

        for (const assignment of assignments) {
          await tx.examAssignment.upsert({
            where: { id: assignment.id },
            update: assignment,
            create: assignment,
          });
        }

        // ---------------------------------------------------------------------
        // Attempts
        // ---------------------------------------------------------------------
        await tx.examAttempt.upsert({
          where: { id: IDS.attempts.completedMath },
          update: {
            userId: IDS.users.freeStudent,
            examId: IDS.exams.mathFree,
            assignmentId: IDS.assignments.mathForFreeStudent,
            status: AttemptStatus.COMPLETED,
            submittedAt: DATES.attemptSubmittedAt,
            correctCount: 2,
            totalQuestions: 3,
            startedAt: DATES.attemptStartedAt,
          },
          create: {
            id: IDS.attempts.completedMath,
            userId: IDS.users.freeStudent,
            examId: IDS.exams.mathFree,
            assignmentId: IDS.assignments.mathForFreeStudent,
            status: AttemptStatus.COMPLETED,
            submittedAt: DATES.attemptSubmittedAt,
            correctCount: 2,
            totalQuestions: 3,
            startedAt: DATES.attemptStartedAt,
          },
        });

        await tx.examAttempt.upsert({
          where: { id: IDS.attempts.inProgressScience },
          update: {
            userId: IDS.users.proStudent,
            examId: IDS.exams.sciencePro,
            assignmentId: IDS.assignments.scienceForProStudent,
            status: AttemptStatus.IN_PROGRESS,
            submittedAt: null,
            correctCount: 0,
            totalQuestions: 2,
            startedAt: new Date('2026-09-05T06:30:00.000Z'),
          },
          create: {
            id: IDS.attempts.inProgressScience,
            userId: IDS.users.proStudent,
            examId: IDS.exams.sciencePro,
            assignmentId: IDS.assignments.scienceForProStudent,
            status: AttemptStatus.IN_PROGRESS,
            correctCount: 0,
            totalQuestions: 2,
            startedAt: new Date('2026-09-05T06:30:00.000Z'),
          },
        });

        // Bài Toán đã hoàn thành: đúng 2/3 câu để lịch sử có dữ liệu thực tế hơn.
        const attemptAnswers = [
          {
            id: IDS.attemptAnswers.mathFraction,
            attemptId: IDS.attempts.completedMath,
            questionId: IDS.questions.mathFraction,
            selectedOptionId: IDS.options.mathFractionA,
            answerType: AnswerValueType.TEXT,
            rawValue: '2/4',
            normalizedText: '2/4',
            content: null,
            isCorrect: true,
            position: 0,
            numericValue: null,
          },
          {
            id: IDS.attemptAnswers.mathEquation,
            attemptId: IDS.attempts.completedMath,
            questionId: IDS.questions.mathEquation,
            selectedOptionId: IDS.options.mathEquationC,
            answerType: AnswerValueType.TEXT,
            rawValue: '6',
            normalizedText: '6',
            content: null,
            isCorrect: false,
            position: 1,
            numericValue: null,
          },
          {
            id: IDS.attemptAnswers.mathRectangle,
            attemptId: IDS.attempts.completedMath,
            questionId: IDS.questions.mathRectangle,
            selectedOptionId: null,
            answerType: AnswerValueType.NUMBER,
            rawValue: '16',
            normalizedText: null,
            content: '16',
            isCorrect: true,
            position: 2,
            numericValue: 16,
          },
        ] as const;

        for (const answer of attemptAnswers) {
          await tx.attemptAnswer.upsert({
            where: { id: answer.id },
            update: answer,
            create: answer,
          });
        }
      },
      {
        maxWait: 30_000,
        timeout: 120_000,
      },
    );

    console.log(
      'CourseManagement seed completed: 4 users, 6 subjects, 6 materials, 4 exams, 8 questions, assignments and attempts.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CourseManagement seed failed: ${message}`);
  process.exitCode = 1;
});
