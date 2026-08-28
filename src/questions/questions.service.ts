import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionsDto } from './dto/update-questions.dto';
import { CreateQuestionOptionDto, UpdateQuestionOptionDto } from './dto/question-option.dto';

const questionInclude = {
    questionOptions: {
        orderBy: {
            position: 'asc' as const,
        },
    },
    questionAcceptedAnswers: {
        orderBy: {
            position: 'asc' as const,
        },
    },
} as const;

const publicQuestionInclude = {
    questionOptions: {
        select: {
            id: true,
            contentText: true,
            position: true,
        },
        orderBy: {
            position: 'asc' as const,
        },
    },
} as const;

@Injectable()
export class QuestionsService {
    constructor(private readonly prismaService: PrismaService) {}

    async create(examId: string, createQuestionDto: CreateQuestionDto) {
        const [exam, subject] = await Promise.all([
            this.prismaService.exam.findUnique({
                where: { id: examId, deletedAt: null },
                select: { id: true },
            }),
            this.prismaService.subject.findUnique({
                where: { id: createQuestionDto.subjectId },
                select: { id: true, isActive: true },
            }),
        ]);

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }
        if (!subject || !subject.isActive) {
            throw new NotFoundException('Subject not found');
        }

        return this.prismaService.$transaction(async (transaction) => {
            const position = await transaction.question.count({
                where: {
                    examId,
                    deletedAt: null,
                },
            });

            const question = await transaction.question.create({
                data: {
                    examId,
                    subjectId: createQuestionDto.subjectId,
                    questionType: createQuestionDto.questionType,
                    contentText: createQuestionDto.contentText,
                    imageUrl: createQuestionDto.imageUrl,
                    instruction: createQuestionDto.instruction,
                    explaination: createQuestionDto.explaination,
                    timeLimitSeconds: createQuestionDto.timeLimitSeconds,
                    correctTextAnswer: createQuestionDto.correctTextAnswer,
                    position,
                },
            });

            if (createQuestionDto.options && createQuestionDto.options.length > 0) {
                await transaction.questionOption.createMany({
                    data: createQuestionDto.options.map((opt, index) => ({
                        questionId: question.id,
                        contentText: opt.contentText,
                        isCorrect: opt.isCorrect ?? false,
                        position: opt.position ?? index,
                    })),
                });
            }

            return transaction.question.findUnique({
                where: { id: question.id },
                include: questionInclude,
            });
        });
    }

    async findByExam(examId: string, includeAnswers = false) {
        const exam = await this.prismaService.exam.findUnique({
            where: { id: examId, deletedAt: null },
            select: { id: true },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return this.prismaService.question.findMany({
            where: {
                examId,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
            include: includeAnswers ? questionInclude : publicQuestionInclude,
            orderBy: {
                position: 'asc',
            },
        });
    }

    async find(id: string, includeAnswers = false) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
            include: includeAnswers ? questionInclude : publicQuestionInclude,
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        return question;
    }

    async update(id: string, updateQuestionsDto: UpdateQuestionsDto) {
        const existing = await this.find(id, true);

        if (updateQuestionsDto.subjectId !== undefined) {
            await this.ensureActiveSubject(updateQuestionsDto.subjectId);
        }

        return this.prismaService.$transaction(async (transaction) => {
            const { options, ...questionData } = updateQuestionsDto;

            await transaction.question.update({
                where: { id },
                data: questionData,
            });

            if (options !== undefined) {
                // Replace options
                await transaction.questionOption.deleteMany({
                    where: { questionId: id },
                });

                if (options.length > 0) {
                    await transaction.questionOption.createMany({
                        data: options.map((opt, index) => ({
                            questionId: id,
                            contentText: opt.contentText,
                            isCorrect: opt.isCorrect ?? false,
                            position: opt.position ?? index,
                        })),
                    });
                }
            }

            return transaction.question.findUnique({
                where: { id },
                include: questionInclude,
            });
        });
    }

    async updateOrder(id: string, order: number) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        const numberOfQuestions = await this.prismaService.question.count({
            where: {
                examId: question.examId,
                deletedAt: null,
            },
        });

        if (order < 0 || order >= numberOfQuestions) {
            throw new BadRequestException(
                `Order must be between 0 and ${numberOfQuestions - 1}`,
            );
        }

        if (question.position === order) {
            return this.find(id, true);
        }

        return this.prismaService.$transaction(async (transaction) => {
            if (order < question.position) {
                await transaction.question.updateMany({
                    where: {
                        examId: question.examId,
                        deletedAt: null,
                        position: {
                            gte: order,
                            lt: question.position,
                        },
                    },
                    data: {
                        position: {
                            increment: 1,
                        },
                    },
                });
            } else {
                await transaction.question.updateMany({
                    where: {
                        examId: question.examId,
                        deletedAt: null,
                        position: {
                            gt: question.position,
                            lte: order,
                        },
                    },
                    data: {
                        position: {
                            decrement: 1,
                        },
                    },
                });
            }

            await transaction.question.update({
                where: { id },
                data: { position: order },
            });

            return transaction.question.findUnique({
                where: { id },
                include: questionInclude,
            });
        });
    }

    async deleteQuestion(id: string) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        return this.prismaService.$transaction(async (transaction) => {
            const deletedQuestion = await transaction.question.update({
                where: { id },
                data: { deletedAt: new Date() },
            });

            await transaction.question.updateMany({
                where: {
                    examId: question.examId,
                    deletedAt: null,
                    position: {
                        gt: question.position,
                    },
                },
                data: {
                    position: {
                        decrement: 1,
                    },
                },
            });

            return deletedQuestion;
        });
    }

    // QuestionOption sub-resource methods
    async createOption(questionId: string, dto: CreateQuestionOptionDto) {
        await this.find(questionId, true);

        const position = dto.position ?? (await this.prismaService.questionOption.count({
            where: { questionId },
        }));

        return this.prismaService.questionOption.create({
            data: {
                questionId,
                contentText: dto.contentText,
                isCorrect: dto.isCorrect ?? false,
                position,
            },
        });
    }

    async updateOption(optionId: string, dto: UpdateQuestionOptionDto) {
        const option = await this.prismaService.questionOption.findUnique({
            where: { id: optionId },
            select: {
                id: true,
                question: {
                    select: {
                        deletedAt: true,
                        exam: { select: { deletedAt: true } },
                    },
                },
            },
        });

        if (!option || option.question?.deletedAt || option.question?.exam?.deletedAt) {
            throw new NotFoundException('Option not found');
        }

        return this.prismaService.questionOption.update({
            where: { id: optionId },
            data: dto,
        });
    }

    async deleteOption(optionId: string) {
        const option = await this.prismaService.questionOption.findUnique({
            where: { id: optionId },
            select: {
                id: true,
                question: {
                    select: {
                        deletedAt: true,
                        exam: { select: { deletedAt: true } },
                    },
                },
            },
        });

        if (!option || option.question?.deletedAt || option.question?.exam?.deletedAt) {
            throw new NotFoundException('Option not found');
        }

        return this.prismaService.questionOption.delete({
            where: { id: optionId },
        });
    }

    private async ensureActiveSubject(subjectId: string) {
        const subject = await this.prismaService.subject.findUnique({
            where: { id: subjectId },
            select: { id: true, isActive: true },
        });

        if (!subject || !subject.isActive) {
            throw new NotFoundException('Subject not found');
        }
    }
}
