import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    AnswerValueType,
    AttemptStatus,
    QuestionType,
} from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptQueryDto } from './dto/attempt-query.dto';
import { SaveAttemptAnswerDto } from './dto/save-attempt-answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';

const safeQuestionSelect = {
    id: true,
    examId: true,
    questionType: true,
    contentText: true,
    imageUrl: true,
    instruction: true,
    explaination: true,
    timeLimitSeconds: true,
    position: true,
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

const attemptDetailSelect = {
    id: true,
    userId: true,
    examId: true,
    assignmentId: true,
    status: true,
    submittedAt: true,
    correctCount: true,
    totalQuestions: true,
    startedAt: true,
    createdAt: true,
    updatedAt: true,
    user: {
        select: {
            id: true,
            fullName: true,
            email: true,
        },
    },
    exam: {
        select: {
            id: true,
            title: true,
            status: true,
        },
    },
    assignment: {
        select: {
            id: true,
            assignedAt: true,
            dueAt: true,
        },
    },
    attemptedAnswers: {
        select: {
            id: true,
            questionId: true,
            selectedOptionId: true,
            answerType: true,
            rawValue: true,
            normalizedText: true,
            content: true,
            numericValue: true,
            position: true,
            createdAt: true,
            updatedAt: true,
            question: {
                select: safeQuestionSelect,
            },
            selectedOption: {
                select: {
                    id: true,
                    contentText: true,
                    position: true,
                },
            },
        },
        orderBy: {
            position: 'asc' as const,
        },
    },
} as const;

@Injectable()
export class AttemptsService {
    constructor(private readonly prisma: PrismaService) {}

    async start(
        examId: string,
        userId: string,
        startAttemptDto: StartAttemptDto,
    ) {
        const exam = await this.prisma.exam.findUnique({
            where: { id: examId },
            select: {
                id: true,
                status: true,
                title: true,
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        if (exam.status !== 'PUBLISHED') {
            throw new ForbiddenException('Exam is not published');
        }

        let assignmentId = startAttemptDto.assignmentId;

        if (assignmentId) {
            const assignment = await this.prisma.examAssignment.findUnique({
                where: { id: assignmentId },
                select: {
                    id: true,
                    userId: true,
                    examId: true,
                    dueAt: true,
                },
            });

            if (
                !assignment ||
                assignment.userId !== userId ||
                assignment.examId !== examId
            ) {
                throw new NotFoundException('Assignment not found');
            }

            if (assignment.dueAt.getTime() < Date.now()) {
                throw new ForbiddenException('Assignment is overdue');
            }
        } else {
            const assignment = await this.prisma.examAssignment.findFirst({
                where: {
                    userId,
                    examId,
                },
                orderBy: { dueAt: 'asc' },
                select: { id: true, dueAt: true },
            });

            if (assignment) {
                if (assignment.dueAt.getTime() < Date.now()) {
                    throw new ForbiddenException('Assignment is overdue');
                }

                assignmentId = assignment.id;
            }
        }

        const existingAttempt = await this.prisma.examAttempt.findFirst({
            where: {
                userId,
                examId,
                assignmentId,
                status: AttemptStatus.IN_PROGRESS,
            },
            orderBy: { startedAt: 'desc' },
            select: { id: true },
        });

        if (existingAttempt) {
            return this.getAttemptWithQuestions(existingAttempt.id, userId);
        }

        const totalQuestions = await this.prisma.question.count({
            where: {
                examId,
                deletedAt: null,
            },
        });

        const attempt = await this.prisma.examAttempt.create({
            data: {
                userId,
                examId,
                assignmentId,
                totalQuestions,
            },
            select: { id: true },
        });

        return this.getAttemptWithQuestions(attempt.id, userId);
    }

    async findAll(query: AttemptQueryDto, userId?: string) {
        const effectiveUserId = userId ?? query.userId;
        return this.prisma.examAttempt.findMany({
            where: {
                userId: effectiveUserId,
                examId: query.examId,
                status: query.status,
            },
            select: {
                id: true,
                userId: true,
                examId: true,
                assignmentId: true,
                status: true,
                submittedAt: true,
                correctCount: true,
                totalQuestions: true,
                startedAt: true,
                createdAt: true,
                updatedAt: true,
                exam: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
    }

    async findOne(id: string, userId?: string) {
        const attempt = await this.getAttempt(id, userId);
        return this.prisma.examAttempt.findUnique({
            where: { id: attempt.id },
            select: attemptDetailSelect,
        });
    }

    async saveAnswer(
        attemptId: string,
        userId: string,
        saveAttemptAnswerDto: SaveAttemptAnswerDto,
    ) {
        const attempt = await this.getAttempt(attemptId, userId);

        if (attempt.status !== AttemptStatus.IN_PROGRESS) {
            throw new ConflictException('Attempt is no longer in progress');
        }

        const question = await this.prisma.question.findFirst({
            where: {
                id: saveAttemptAnswerDto.questionId,
                examId: attempt.examId,
                deletedAt: null,
            },
            select: {
                id: true,
                position: true,
                questionType: true,
                questionOptions: {
                    select: {
                        id: true,
                        contentText: true,
                        isCorrect: true,
                    },
                },
            },
        });

        if (!question) {
            throw new NotFoundException('Question not found for this exam');
        }

        const selectedOptionId = saveAttemptAnswerDto.selectedOptionId;
        const selectedOption = selectedOptionId
            ? question.questionOptions.find(
                  (option) => option.id === selectedOptionId,
              )
            : undefined;

        if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
            if (!selectedOptionId || !selectedOption) {
                throw new BadRequestException(
                    'A valid selectedOptionId is required for multiple-choice questions',
                );
            }
        } else if (!saveAttemptAnswerDto.rawValue?.trim()) {
            throw new BadRequestException(
                'rawValue is required for short-answer questions',
            );
        }

        const answerType =
            saveAttemptAnswerDto.answerType ??
            (saveAttemptAnswerDto.numericValue !== undefined
                ? AnswerValueType.NUMBER
                : AnswerValueType.TEXT);
        const rawValue =
            saveAttemptAnswerDto.rawValue ?? selectedOption?.contentText ?? '';
        const normalizedText =
            saveAttemptAnswerDto.normalizedText ?? this.normalize(rawValue);
        const isCorrect = selectedOption?.isCorrect ?? false;

        const existingAnswer = await this.prisma.attemptAnswer.findFirst({
            where: {
                attemptId,
                questionId: question.id,
            },
            select: { id: true },
        });

        const data = {
            questionId: question.id,
            selectedOptionId: selectedOptionId ?? null,
            answerType,
            rawValue,
            normalizedText,
            content: saveAttemptAnswerDto.content,
            isCorrect,
            position: question.position,
            numericValue: saveAttemptAnswerDto.numericValue,
        };

        const answer = existingAnswer
            ? await this.prisma.attemptAnswer.update({
                  where: { id: existingAnswer.id },
                  data,
              })
            : await this.prisma.attemptAnswer.create({
                  data: {
                      attemptId,
                      ...data,
                  },
              });

        return {
            id: answer.id,
            attemptId: answer.attemptId,
            questionId: answer.questionId,
            selectedOptionId: answer.selectedOptionId,
            answerType: answer.answerType,
            rawValue: answer.rawValue,
            normalizedText: answer.normalizedText,
            content: answer.content,
            position: answer.position,
            numericValue: answer.numericValue,
        };
    }

    async submit(attemptId: string, userId: string) {
        const attempt = await this.getAttempt(attemptId, userId);

        if (attempt.status === AttemptStatus.COMPLETED) {
            return this.getResult(attemptId, userId);
        }

        if (attempt.status !== AttemptStatus.IN_PROGRESS) {
            throw new ConflictException('Attempt cannot be submitted');
        }

        const questions = await this.prisma.question.findMany({
            where: {
                examId: attempt.examId,
                deletedAt: null,
            },
            select: {
                id: true,
                questionType: true,
                correctTextAnswer: true,
                questionOptions: {
                    select: {
                        id: true,
                        isCorrect: true,
                    },
                },
                questionAcceptedAnswers: {
                    select: {
                        answerType: true,
                        rawValue: true,
                        normalizedText: true,
                        numericValue: true,
                    },
                },
            },
        });

        const answers = await this.prisma.attemptAnswer.findMany({
            where: { attemptId },
            select: {
                id: true,
                questionId: true,
                selectedOptionId: true,
                answerType: true,
                rawValue: true,
                normalizedText: true,
                numericValue: true,
            },
        });

        const answersByQuestion = new Map(
            answers.map((answer) => [answer.questionId, answer]),
        );
        const evaluations = questions.flatMap((question) => {
            const answer = answersByQuestion.get(question.id);

            if (!answer) {
                return [];
            }

            const isCorrect = this.isAnswerCorrect(question, answer);
            return [{ answer, isCorrect }];
        });
        const correctCount = evaluations.filter(
            (evaluation) => evaluation.isCorrect,
        ).length;

        await this.prisma.$transaction(async (transaction) => {
            for (const evaluation of evaluations) {
                await transaction.attemptAnswer.update({
                    where: { id: evaluation.answer.id },
                    data: {
                        isCorrect: evaluation.isCorrect,
                        normalizedText:
                            evaluation.answer.normalizedText ??
                            this.normalize(evaluation.answer.rawValue),
                    },
                });
            }

            await transaction.examAttempt.update({
                where: { id: attemptId },
                data: {
                    status: AttemptStatus.COMPLETED,
                    submittedAt: new Date(),
                    correctCount,
                },
            });
        });

        return this.getResult(attemptId, userId);
    }

    async getResult(attemptId: string, userId?: string) {
        const attempt = await this.getAttempt(attemptId, userId);

        if (attempt.status !== AttemptStatus.COMPLETED) {
            throw new ConflictException('Attempt has not been submitted');
        }

        const result = await this.prisma.examAttempt.findUnique({
            where: { id: attemptId },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
                submittedAt: true,
                correctCount: true,
                totalQuestions: true,
                exam: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                attemptedAnswers: {
                    select: {
                        id: true,
                        questionId: true,
                        selectedOptionId: true,
                        answerType: true,
                        rawValue: true,
                        normalizedText: true,
                        content: true,
                        isCorrect: true,
                        position: true,
                        numericValue: true,
                        question: {
                            select: {
                                id: true,
                                questionType: true,
                                contentText: true,
                                explaination: true,
                                instruction: true,
                                correctTextAnswer: true,
                                questionOptions: {
                                    select: {
                                        id: true,
                                        contentText: true,
                                        isCorrect: true,
                                        position: true,
                                    },
                                    orderBy: {
                                        position: 'asc' as const,
                                    },
                                },
                                questionAcceptedAnswers: {
                                    select: {
                                        answerType: true,
                                        rawValue: true,
                                        normalizedText: true,
                                        numericValue: true,
                                    },
                                },
                            },
                        },
                        selectedOption: {
                            select: {
                                id: true,
                                contentText: true,
                                position: true,
                            },
                        },
                    },
                    orderBy: {
                        position: 'asc' as const,
                    },
                },
            },
        });

        if (!result) {
            throw new NotFoundException('Attempt not found');
        }

        return {
            ...result,
            percentage:
                result.totalQuestions === 0
                    ? 0
                    : Math.round(
                          (result.correctCount / result.totalQuestions) * 10000,
                      ) / 100,
        };
    }

    private async getAttempt(id: string, userId?: string) {
        const attempt = await this.prisma.examAttempt.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
            },
        });

        if (!attempt || (userId && attempt.userId !== userId)) {
            throw new NotFoundException('Attempt not found');
        }

        return attempt;
    }

    private async getAttemptWithQuestions(id: string, userId: string) {
        const attempt = await this.findOne(id, userId);

        if (!attempt) {
            throw new NotFoundException('Attempt not found');
        }

        const questions = await this.prisma.question.findMany({
            where: {
                examId: attempt.examId,
                deletedAt: null,
            },
            select: safeQuestionSelect,
            orderBy: {
                position: 'asc',
            },
        });

        return {
            ...attempt,
            questions,
        };
    }

    private isAnswerCorrect(
        question: {
            questionType: QuestionType;
            correctTextAnswer: string | null;
            questionOptions: Array<{ id: string; isCorrect: boolean }>;
            questionAcceptedAnswers: Array<{
                answerType: AnswerValueType;
                rawValue: string;
                normalizedText: string | null;
                numericValue: number | null;
            }>;
        },
        answer: {
            selectedOptionId: string | null;
            answerType: AnswerValueType;
            rawValue: string;
            normalizedText: string | null;
            numericValue: number | null;
        },
    ) {
        if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
            return question.questionOptions.some(
                (option) =>
                    option.id === answer.selectedOptionId && option.isCorrect,
            );
        }

        if (
            answer.answerType === AnswerValueType.NUMBER &&
            answer.numericValue !== null
        ) {
            return question.questionAcceptedAnswers.some(
                (acceptedAnswer) =>
                    acceptedAnswer.numericValue !== null &&
                    acceptedAnswer.numericValue === answer.numericValue,
            );
        }

        const normalizedAnswer =
            answer.normalizedText ?? this.normalize(answer.rawValue);
        const correctTextAnswers = question.questionAcceptedAnswers.map(
            (acceptedAnswer) =>
                acceptedAnswer.normalizedText ??
                this.normalize(acceptedAnswer.rawValue),
        );

        if (
            question.correctTextAnswer &&
            this.normalize(question.correctTextAnswer) === normalizedAnswer
        ) {
            return true;
        }

        return correctTextAnswers.includes(normalizedAnswer);
    }

    private normalize(value: string) {
        return value.trim().toLocaleLowerCase();
    }
}
