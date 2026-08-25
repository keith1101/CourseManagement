import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting database seed...');

    const defaultPasswordHash = await bcrypt.hash('Password123@', 10);

    // ==========================================
    // 1. USERS
    // ==========================================
    console.log('👤 Seeding Users...');

    const admin = await prisma.user.upsert({
        where: { email: 'admin@gmail.com' },
        update: {
            passwordHash: defaultPasswordHash,
            isActive: true,
            role: 'ADMIN',
        },
        create: {
            email: 'admin@gmail.com',
            fullName: 'Quản Trị Viên',
            phone: '0901234567',
            dateOfBirth: new Date('1990-01-01'),
            passwordHash: defaultPasswordHash,
            role: 'ADMIN',
            isActive: true,
            accessLevel: 'PRO',
        },
    });

    const studentFree = await prisma.user.upsert({
        where: { email: 'student@gmail.com' },
        update: {
            passwordHash: defaultPasswordHash,
            isActive: true,
            role: 'STUDENT',
            accessLevel: 'FREE',
            proExpiresAt: null,
        },
        create: {
            email: 'student@gmail.com',
            fullName: 'Nguyễn Văn Học',
            phone: '0912345678',
            dateOfBirth: new Date('2006-05-15'),
            passwordHash: defaultPasswordHash,
            role: 'STUDENT',
            isActive: true,
            accessLevel: 'FREE',
        },
    });

    const studentPro = await prisma.user.upsert({
        where: { email: 'prostudent@gmail.com' },
        update: {
            passwordHash: defaultPasswordHash,
            isActive: true,
            role: 'STUDENT',
            accessLevel: 'PRO',
            proExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        create: {
            email: 'prostudent@gmail.com',
            fullName: 'Trần Thị Chăm',
            phone: '0923456789',
            dateOfBirth: new Date('2006-08-20'),
            passwordHash: defaultPasswordHash,
            role: 'STUDENT',
            isActive: true,
            accessLevel: 'PRO',
            proExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
    });

    // ==========================================
    // 2. SUBJECTS
    // ==========================================
    console.log('📚 Seeding Subjects...');

    const subjectsData = [
        { code: 'MATH', name: 'Toán học', description: 'Toán học THPT', displayOrder: 1 },
        { code: 'SCIENCE', name: 'Khoa học Tự nhiên', description: 'Vật lý, Hóa học, Sinh học', displayOrder: 2 },
        { code: 'HISTORY', name: 'Lịch sử', description: 'Lịch sử Việt Nam và Thế giới', displayOrder: 3 },
        { code: 'GEO', name: 'Địa lý', description: 'Địa lý tự nhiên và kinh tế', displayOrder: 4 },
        { code: 'ENG', name: 'Tiếng Anh', description: 'Ngữ pháp và từ vựng Tiếng Anh', displayOrder: 5 },
        { code: 'VIE', name: 'Tiếng Việt', description: 'Ngữ văn và Tiếng Việt', displayOrder: 6 },
    ];

    const subjects: Record<string, { id: string }> = {};
    for (const sub of subjectsData) {
        const created = await prisma.subject.upsert({
            where: { code: sub.code },
            update: {},
            create: {
                code: sub.code,
                name: sub.name,
                description: sub.description,
                displayOrder: sub.displayOrder,
                isActive: true,
            },
        });
        subjects[sub.code] = created;
    }

    // ==========================================
    // 3. MATERIALS
    // ==========================================
    console.log('📄 Seeding Materials...');

    const existingMaterials = await prisma.material.count();
    if (existingMaterials === 0) {
        await prisma.material.createMany({
            data: [
                {
                    subjectId: subjects['MATH'].id,
                    title: 'Đề cương ôn tập Toán 12 - Chuyên đề Khảo sát hàm số',
                    materialType: 'PDF',
                    storageUrl: 'https://example.com/docs/toan-12-khao-sat-ham-so.pdf',
                    originalFileName: 'toan-12-khao-sat-ham-so.pdf',
                    mimeType: 'application/pdf',
                    fileSizeBytes: 2450000,
                    accessLevel: 'FREE',
                    isPublished: true,
                    publishedAt: new Date(),
                },
                {
                    subjectId: subjects['SCIENCE'].id,
                    title: 'Bài giảng Video: Cấu tạo nguyên tử và Bảng tuần hoàn',
                    materialType: 'EMBEDDED_VIDEO',
                    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                    accessLevel: 'FREE',
                    isPublished: true,
                    publishedAt: new Date(),
                },
                {
                    subjectId: subjects['ENG'].id,
                    title: 'Bộ 50 đề thi thử Tiếng Anh THPT Quốc gia (Có giải chi tiết)',
                    materialType: 'PDF',
                    storageUrl: 'https://example.com/docs/50-de-thi-thu-tieng-anh-pro.pdf',
                    originalFileName: '50-de-thi-thu-tieng-anh-pro.pdf',
                    mimeType: 'application/pdf',
                    fileSizeBytes: 5800000,
                    accessLevel: 'PRO',
                    isPublished: true,
                    publishedAt: new Date(),
                },
            ],
        });
    }

    // ==========================================
    // 4. EXAMS & QUESTIONS
    // ==========================================
    console.log('📝 Seeding Exams and Questions...');

    // Exam 1: Đề tổng hợp (PUBLISHED)
    let exam1 = await prisma.exam.findFirst({
        where: { title: 'Đề thi thử Trắc nghiệm Kiến thức Tổng hợp 2026' },
    });

    if (!exam1) {
        exam1 = await prisma.exam.create({
            data: {
                title: 'Đề thi thử Trắc nghiệm Kiến thức Tổng hợp 2026',
                description: 'Đề thi trắc nghiệm tổng hợp gồm Tiếng Việt, Vật lý, Toán học với thời gian làm bài 30 phút.',
                status: 'PUBLISHED',
                accessLevel: 'FREE',
                displayOrder: 1,
                publishedAt: new Date(),
            },
        });

        // Question 1: Tiếng Việt (Multiple choice - tương tự Mẫu 2)
        const q1 = await prisma.question.create({
            data: {
                examId: exam1.id,
                questionType: 'MULTIPLE_CHOICE',
                contentText: 'Câu nào dưới đây có ý nghĩa tương tự với câu "Có công mài sắt, có ngày nên kim"?',
                timeLimitSeconds: 60,
                position: 0,
                instruction: 'Chọn 1 đáp án chính xác nhất.',
                explaination: '"Có công mài sắt, có ngày nên kim" và "Nước chảy đá mòn" đều thể hiện sự kiên trì, bền bỉ sẽ đem lại thành công.',
                questionOptions: {
                    create: [
                        { contentText: 'Nước đến chân mới nhảy.', isCorrect: false, position: 0 },
                        { contentText: 'Nước chảy chỗ trũng.', isCorrect: false, position: 1 },
                        { contentText: 'Nước chảy đá mòn.', isCorrect: true, position: 2 },
                        { contentText: 'Nước lã mà vã nên hồ.', isCorrect: false, position: 3 },
                    ],
                },
            },
        });

        // Question 2: Vật lý (Multiple choice 4 màu - tương tự Mẫu 1 Kahoot-style)
        const q2 = await prisma.question.create({
            data: {
                examId: exam1.id,
                questionType: 'MULTIPLE_CHOICE',
                contentText: 'What happens to a field as you move further from the object creating it?',
                timeLimitSeconds: 20,
                position: 1,
                instruction: 'Select the correct physical behavior of force fields.',
                explaination: 'Theo định luật nghịch đảo bình phương khoảng cách, cường độ trường tỉ lệ nghịch với bình phương khoảng cách (càng xa càng yếu).',
                questionOptions: {
                    create: [
                        { contentText: 'It gets stronger', isCorrect: false, position: 0 },
                        { contentText: 'It stays the same', isCorrect: false, position: 1 },
                        { contentText: 'It disappears immediately', isCorrect: false, position: 2 },
                        { contentText: 'It gets weaker', isCorrect: true, position: 3 },
                    ],
                },
            },
        });

        // Question 3: Lịch sử (Multiple choice)
        const q3 = await prisma.question.create({
            data: {
                examId: exam1.id,
                questionType: 'MULTIPLE_CHOICE',
                contentText: 'Chiến thắng Điện Biên Phủ diễn ra vào năm nào?',
                timeLimitSeconds: 45,
                position: 2,
                instruction: 'Chọn năm diễn ra sự kiện.',
                explaination: 'Chiến thắng Điện Biên Phủ "lừng lẫy năm châu, chấn động địa cầu" diễn ra ngày 07/05/1954.',
                questionOptions: {
                    create: [
                        { contentText: 'Năm 1945', isCorrect: false, position: 0 },
                        { contentText: 'Năm 1954', isCorrect: true, position: 1 },
                        { contentText: 'Năm 1975', isCorrect: false, position: 2 },
                        { contentText: 'Năm 1986', isCorrect: false, position: 3 },
                    ],
                },
            },
        });

        // Question 4: Toán học (Short answer - Tự luận điền số)
        const q4 = await prisma.question.create({
            data: {
                examId: exam1.id,
                questionType: 'SHORT_ANSWER',
                contentText: 'Tính giá trị biểu thức: 2^3 + 5',
                timeLimitSeconds: 30,
                position: 3,
                correctTextAnswer: '13',
                instruction: 'Điền kết quả dạng số vào ô trả lời.',
                explaination: '2^3 = 8; 8 + 5 = 13.',
                questionAcceptedAnswers: {
                    create: [
                        {
                            answerType: 'NUMBER',
                            rawValue: '13',
                            numericValue: 13,
                            isPrimary: true,
                            isCorrect: true,
                            position: 0,
                        },
                    ],
                },
            },
        });
    }

    // Exam 2: Toán 15 phút (PUBLISHED)
    let exam2 = await prisma.exam.findFirst({
        where: { title: 'Kiểm tra 15 phút Toán học - Hàm số' },
    });

    if (!exam2) {
        exam2 = await prisma.exam.create({
            data: {
                title: 'Kiểm tra 15 phút Toán học - Hàm số',
                description: 'Đề kiểm tra nhanh kiến thức về đạo hàm và tính đơn điệu của hàm số.',
                status: 'PUBLISHED',
                accessLevel: 'FREE',
                displayOrder: 2,
                publishedAt: new Date(),
            },
        });

        await prisma.question.create({
            data: {
                examId: exam2.id,
                questionType: 'MULTIPLE_CHOICE',
                contentText: 'Đạo hàm của hàm số y = x^3 là gì?',
                timeLimitSeconds: 60,
                position: 0,
                explaination: '(x^n)\' = n * x^(n-1) => (x^3)\' = 3x^2.',
                questionOptions: {
                    create: [
                        { contentText: '3x^2', isCorrect: true, position: 0 },
                        { contentText: '3x', isCorrect: false, position: 1 },
                        { contentText: 'x^2', isCorrect: false, position: 2 },
                        { contentText: '6x', isCorrect: false, position: 3 },
                    ],
                },
            },
        });

        await prisma.question.create({
            data: {
                examId: exam2.id,
                questionType: 'SHORT_ANSWER',
                contentText: 'Tìm nghiệm của phương trình 2x - 8 = 0',
                timeLimitSeconds: 45,
                position: 1,
                correctTextAnswer: '4',
                explaination: '2x = 8 <=> x = 4.',
                questionAcceptedAnswers: {
                    create: [
                        {
                            answerType: 'NUMBER',
                            rawValue: '4',
                            numericValue: 4,
                            isPrimary: true,
                            isCorrect: true,
                            position: 0,
                        },
                    ],
                },
            },
        });
    }

    // Exam 3: Tiếng Anh (DRAFT - Dùng để test Admin)
    let exam3 = await prisma.exam.findFirst({
        where: { title: 'Đề thi thử Tiếng Anh THPT Quốc gia (Bản nháp)' },
    });

    if (!exam3) {
        exam3 = await prisma.exam.create({
            data: {
                title: 'Đề thi thử Tiếng Anh THPT Quốc gia (Bản nháp)',
                description: 'Bản thảo đề thi Tiếng Anh chuẩn cấu trúc Bộ GD&ĐT.',
                status: 'DRAFT',
                accessLevel: 'PRO',
                displayOrder: 3,
            },
        });
    }

    // ==========================================
    // 5. ASSIGNMENTS
    // ==========================================
    console.log('📌 Seeding Assignments...');

    const existingAssignment = await prisma.examAssignment.findFirst({
        where: { userId: studentFree.id, examId: exam1.id },
    });

    let assignment1 = existingAssignment;
    if (!assignment1) {
        assignment1 = await prisma.examAssignment.create({
            data: {
                userId: studentFree.id,
                examId: exam1.id,
                assignedAt: new Date(),
                dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
            },
        });
    }

    // ==========================================
    // 6. SAMPLE COMPLETED ATTEMPT & RESULTS
    // ==========================================
    console.log('🏆 Seeding Sample Completed Attempt & Result...');

    const existingAttempt = await prisma.examAttempt.findFirst({
        where: { userId: studentFree.id, examId: exam1.id, status: 'COMPLETED' },
    });

    if (!existingAttempt) {
        const questions = await prisma.question.findMany({
            where: { examId: exam1.id },
            include: { questionOptions: true },
            orderBy: { position: 'asc' },
        });

        const attempt = await prisma.examAttempt.create({
            data: {
                userId: studentFree.id,
                examId: exam1.id,
                assignmentId: assignment1.id,
                status: 'COMPLETED',
                startedAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
                submittedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
                totalQuestions: questions.length,
                correctCount: 3, // 3 out of 4 correct (75%)
            },
        });

        // Add answers for each question
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];

            if (q.questionType === 'MULTIPLE_CHOICE') {
                // Correct answer for q0, q1; Wrong answer for q2
                const correctOption = q.questionOptions.find((o) => o.isCorrect);
                const wrongOption = q.questionOptions.find((o) => !o.isCorrect);
                const chosenOption = i === 2 ? wrongOption : correctOption;

                if (chosenOption) {
                    await prisma.attemptAnswer.create({
                        data: {
                            attemptId: attempt.id,
                            questionId: q.id,
                            selectedOptionId: chosenOption.id,
                            answerType: 'TEXT',
                            rawValue: chosenOption.contentText,
                            normalizedText: chosenOption.contentText.trim().toLowerCase(),
                            isCorrect: chosenOption.isCorrect,
                            position: q.position,
                        },
                    });
                }
            } else {
                // Short answer (q3) -> correct answer "13"
                await prisma.attemptAnswer.create({
                    data: {
                        attemptId: attempt.id,
                        questionId: q.id,
                        answerType: 'NUMBER',
                        rawValue: '13',
                        numericValue: 13,
                        normalizedText: '13',
                        isCorrect: true,
                        position: q.position,
                    },
                });
            }
        }
    }

    console.log('✅ Mock data seeded successfully!');
    console.log('--------------------------------------------------');
    console.log('Admin account:   admin@gmail.com    / Password123@');
    console.log('Student account: student@gmail.com  / Password123@');
    console.log('Pro student:     prostudent@gmail.com / Password123@');
    console.log('--------------------------------------------------');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
