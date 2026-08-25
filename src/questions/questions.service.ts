import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionsDto } from './dto/update-questions.dto';

@Injectable()
export class QuestionsService {
    constructor(private readonly prismaService: PrismaService) {}

    async create(examId: string, createQuestionDto: CreateQuestionDto) {
        const exam = await this.prismaService.exam.findUnique({
            where: { id: examId },
            select: { id: true },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return this.prismaService.$transaction(async (transaction) => {
            const position = await transaction.question.count({
                where: {
                    examId,
                    deletedAt: null,
                },
            });

            return transaction.question.create({
                data: {
                    examId,
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
        });
    }

    async findByExam(examId: string) {
        const exam = await this.prismaService.exam.findUnique({
            where: { id: examId },
            select: { id: true },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return this.prismaService.question.findMany({
            where: {
                examId,
                deletedAt: null,
            },
            orderBy: {
                position: 'asc',
            },
        });
    }

    async find(id: string) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
            },
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        return question;
    }

    async update(id: string, updateQuestionsDto: UpdateQuestionsDto) {
        await this.find(id);

        return this.prismaService.question.update({
            where: { id },
            data: updateQuestionsDto,
        });
    }

    async updateOrder(id: string, order: number) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
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
            return question;
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

            return transaction.question.update({
                where: { id },
                data: { position: order },
            });
        });
    }

    async deleteQuestion(id: string) {
        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
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
}
