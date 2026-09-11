import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QuestionType } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
    GcsStorageService,
    StorageUploadFile,
} from '../storage/gcs-storage.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionsDto } from './dto/update-questions.dto';
import { CreateQuestionOptionDto, UpdateQuestionOptionDto } from './dto/question-option.dto';
import {
    sanitizeStudentQuestion,
    studentQuestionSelect,
} from './question-response';
import { ExamsService } from '../exams/exams.service';

const questionInclude = {
    exam: {
        select: {
            id: true,
            status: true,
            deletedAt: true,
        },
    },
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

type AnswerKeyOption = {
    id?: string;
    isCorrect?: boolean | null;
};

@Injectable()
export class QuestionsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly gcsStorage: GcsStorageService,
        private readonly examsService: ExamsService,
    ) {}

    async uploadImage(file: StorageUploadFile) {
        if (!file.mimetype?.startsWith('image/')) {
            throw new BadRequestException('Only image files are allowed');
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new BadRequestException('Image size cannot exceed 5 MB');
        }

        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
        const objectName = `questions/${randomUUID()}-${safeFileName || 'image'}`;
        const uploaded = await this.gcsStorage.upload(file, objectName);

        try {
            const url = await this.gcsStorage.getSignedReadUrl(uploaded.gsUri);
            return {
                url,
                imageUrl: url,
                storageUri: uploaded.gsUri,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            };
        } catch (error) {
            await this.gcsStorage.delete(uploaded.gsUri).catch(() => undefined);
            throw error;
        }
    }

    async create(examId: string, createQuestionDto: CreateQuestionDto) {
        const [exam, subject] = await Promise.all([
            this.prismaService.exam.findUnique({
                where: { id: examId, deletedAt: null },
                select: { id: true, status: true },
            }),
            this.prismaService.subject.findUnique({
                where: { id: createQuestionDto.subjectId },
                select: { id: true, isActive: true },
            }),
        ]);

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }
        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(examId);
        } else if ((exam as any).status && (exam as any).status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
        }
        if (!subject || !subject.isActive) {
            throw new NotFoundException('Subject not found');
        }

        this.validateImageReferences(createQuestionDto);
        this.validateAnswerKey(
            createQuestionDto.questionType,
            createQuestionDto.correctTextAnswer,
            createQuestionDto.options ?? [],
        );

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
                    hintImageUrl: createQuestionDto.hintImageUrl,
                    hint: createQuestionDto.hint,
                    instruction: createQuestionDto.instruction,
                    explaination: createQuestionDto.explaination,
                    explanationImageUrl: createQuestionDto.explanationImageUrl,
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
                        imageUrl: opt.imageUrl,
                        isCorrect: opt.isCorrect ?? false,
                        position: opt.position ?? index,
                    })),
                });
            }

            return transaction.question.findUnique({
                where: { id: question.id },
                include: questionInclude,
            });
        }).then((question) =>
            question ? this.withQuestionMedia(question) : question,
        );
    }

    async findByExam(examId: string, includeAnswers = false, userId?: string) {
        if (includeAnswers) {
            const exam = await this.prismaService.exam.findUnique({
                where: { id: examId, deletedAt: null },
                select: { id: true },
            });

            if (!exam) {
                throw new NotFoundException('Exam not found');
            }
        } else {
            if (!userId) {
                throw new ForbiddenException('Authenticated student context is required');
            }

            await this.examsService.assertStudentCanAccessExam(examId, userId);

            // The legacy screen still needs its full question collection while
            // existing v1 attempts finish. Version-2 attempts never pass this
            // check, so a student cannot use this endpoint to enumerate locked
            // questions or their answer keys.
            const attemptModel = (this.prismaService as any).examAttempt;
            if (attemptModel?.findFirst) {
                const sequentialAttempt = await attemptModel.findFirst({
                    where: {
                        examId,
                        userId,
                        status: 'IN_PROGRESS',
                        flowVersion: 2,
                    },
                    select: { id: true },
                });
                if (sequentialAttempt) {
                    throw new ForbiddenException(
                        'Question access requires the current-question endpoint for a sequential attempt',
                    );
                }
                const legacyAttempt = await attemptModel.findFirst({
                    where: {
                        examId,
                        userId,
                        status: 'IN_PROGRESS',
                        flowVersion: 1,
                    },
                    select: { id: true },
                });
                if (!legacyAttempt) {
                    throw new ForbiddenException(
                        'Question access requires an active legacy attempt',
                    );
                }
            }
        }

        if (includeAnswers) {
            const questions = await this.prismaService.question.findMany({
                where: {
                    examId,
                    deletedAt: null,
                    exam: { is: { deletedAt: null } },
                },
                include: questionInclude,
                orderBy: {
                    position: 'asc',
                },
            });

            return Promise.all(
                questions.map((question) => this.withQuestionMedia(question)),
            );
        }

        const questions = await this.prismaService.question.findMany({
            where: {
                examId,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
            select: studentQuestionSelect,
            orderBy: {
                position: 'asc',
            },
        });

        const decoratedQuestions = await Promise.all(
            questions.map((question) => this.withQuestionMedia(question)),
        );

        return decoratedQuestions.map((question) =>
            sanitizeStudentQuestion(question),
        );
    }

    async find(id: string, includeAnswers = false) {
        if (includeAnswers) {
            const question = await this.prismaService.question.findFirst({
                where: {
                    id,
                    deletedAt: null,
                    exam: { is: { deletedAt: null } },
                },
                include: questionInclude,
            });

            if (!question) {
                throw new NotFoundException('Question not found');
            }

            return this.withQuestionMedia(question);
        }

        const question = await this.prismaService.question.findFirst({
            where: {
                id,
                deletedAt: null,
                exam: { is: { deletedAt: null } },
            },
            select: studentQuestionSelect,
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        const decoratedQuestion = await this.withQuestionMedia(question);
        return sanitizeStudentQuestion(decoratedQuestion);
    }

    async update(id: string, updateQuestionsDto: UpdateQuestionsDto) {
        const existing = (await this.find(id, true)) as any;

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(existing.examId);
        } else if (existing.exam?.status && existing.exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
        }

        if (updateQuestionsDto.subjectId !== undefined) {
            await this.ensureActiveSubject(updateQuestionsDto.subjectId);
        }

        const questionType =
            updateQuestionsDto.questionType ?? existing.questionType;
        const correctTextAnswer =
            updateQuestionsDto.correctTextAnswer !== undefined
                ? updateQuestionsDto.correctTextAnswer
                : existing.correctTextAnswer;
        const options =
            updateQuestionsDto.options !== undefined
                ? updateQuestionsDto.options
                : existing.questionOptions;

        this.validateImageReferences(updateQuestionsDto);
        this.validateAnswerKey(questionType, correctTextAnswer, options);

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
                            imageUrl: opt.imageUrl,
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
        }).then((question) =>
            question ? this.withQuestionMedia(question) : question,
        );
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

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(question.examId);
        } else if ((question as any).exam?.status && (question as any).exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
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
        }).then((questionResult) =>
            questionResult ? this.withQuestionMedia(questionResult) : questionResult,
        );
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

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(question.examId);
        } else if ((question as any).exam?.status && (question as any).exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
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
        const question = (await this.find(questionId, true)) as any;

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(question.examId);
        } else if (question.exam?.status && question.exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
        }

        this.validateImageReference(dto.imageUrl);

        this.validateAnswerKey(
            question.questionType,
            question.correctTextAnswer,
            [
                ...question.questionOptions,
                { isCorrect: dto.isCorrect ?? false },
            ],
        );

        const position = dto.position ?? (await this.prismaService.questionOption.count({
            where: { questionId },
        }));

        const option = await this.prismaService.questionOption.create({
            data: {
                questionId,
                contentText: dto.contentText,
                imageUrl: dto.imageUrl,
                isCorrect: dto.isCorrect ?? false,
                position,
            },
        });

        return this.withOptionMedia(option);
    }

    async updateOption(optionId: string, dto: UpdateQuestionOptionDto) {
        this.validateImageReference(dto.imageUrl);
        const option = await this.prismaService.questionOption.findUnique({
            where: { id: optionId },
            select: {
                id: true,
                isCorrect: true,
                question: {
                    select: {
                        examId: true,
                        questionType: true,
                        correctTextAnswer: true,
                        deletedAt: true,
                        exam: { select: { deletedAt: true, status: true } },
                        questionOptions: {
                            select: {
                                id: true,
                                isCorrect: true,
                            },
                        },
                    },
                },
            },
        });

        if (!option || option.question?.deletedAt || option.question?.exam?.deletedAt) {
            throw new NotFoundException('Option not found');
        }

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(
                option.question.examId,
            );
        } else if (option.question.exam?.status && option.question.exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
        }

        this.validateAnswerKey(
            option.question.questionType,
            option.question.correctTextAnswer,
            option.question.questionOptions.map((currentOption) => ({
                id: currentOption.id,
                isCorrect:
                    currentOption.id === option.id
                        ? (dto.isCorrect ?? option.isCorrect)
                        : currentOption.isCorrect,
            })),
        );

        const updatedOption = await this.prismaService.questionOption.update({
            where: { id: optionId },
            data: dto,
        });

        return this.withOptionMedia(updatedOption);
    }

    async deleteOption(optionId: string) {
        const option = await this.prismaService.questionOption.findUnique({
            where: { id: optionId },
            select: {
                id: true,
                isCorrect: true,
                question: {
                    select: {
                        examId: true,
                        questionType: true,
                        correctTextAnswer: true,
                        deletedAt: true,
                        exam: { select: { deletedAt: true, status: true } },
                        questionOptions: {
                            select: {
                                id: true,
                                isCorrect: true,
                            },
                        },
                    },
                },
            },
        });

        if (!option || option.question?.deletedAt || option.question?.exam?.deletedAt) {
            throw new NotFoundException('Option not found');
        }

        if (
            typeof (this.examsService as any).assertExamCanEditQuestions === 'function'
        ) {
            await (this.examsService as ExamsService).assertExamCanEditQuestions(
                option.question.examId,
            );
        } else if (option.question.exam?.status && option.question.exam.status !== 'DRAFT') {
            throw new ConflictException('Questions can only be changed in a draft exam');
        }

        this.validateAnswerKey(
            option.question.questionType,
            option.question.correctTextAnswer,
            option.question.questionOptions.filter(
                (currentOption) => currentOption.id !== option.id,
            ),
        );

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

    private validateImageReferences(
        dto: CreateQuestionDto | UpdateQuestionsDto,
    ) {
        this.validateImageReference(dto.imageUrl);
        this.validateImageReference(dto.hintImageUrl);
        this.validateImageReference(dto.explanationImageUrl);
        dto.options?.forEach((option) =>
            this.validateImageReference(option.imageUrl),
        );
    }

    private validateImageReference(reference?: string | null) {
        const value = reference?.trim();
        if (!value) return;

        if (value.length > 2048) {
            throw new BadRequestException('Image URL cannot exceed 2048 characters');
        }

        if (value.startsWith('gs://')) return;

        if (value.startsWith('data:')) {
            throw new BadRequestException(
                'Base64 image data is not accepted. Upload the image first',
            );
        }

        try {
            const url = new URL(value);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error('Unsupported image protocol');
            }
        } catch {
            throw new BadRequestException('Image URL must be a valid HTTP(S) URL');
        }
    }

    private async withOptionMedia<T extends { imageUrl?: string | null }>(
        option: T,
    ) {
        if (!option.imageUrl) return option;

        const resolved = await this.gcsStorage.resolveReadUrl(option.imageUrl);
        return {
            ...option,
            imageUrl: resolved.url,
            ...(resolved.storageUri
                ? { imageStorageUri: resolved.storageUri }
                : {}),
        };
    }

    private async withQuestionMedia<
        T extends {
            imageUrl?: string | null;
            hintImageUrl?: string | null;
            explanationImageUrl?: string | null;
            questionOptions?: Array<{ imageUrl?: string | null }>;
        },
    >(question: T) {
        const mediaFields: Record<string, string> = {};

        if (question.imageUrl) {
            const resolved = await this.gcsStorage.resolveReadUrl(question.imageUrl);
            mediaFields.imageUrl = resolved.url ?? question.imageUrl;
            if (resolved.storageUri) mediaFields.imageStorageUri = resolved.storageUri;
        }

        if (question.hintImageUrl) {
            const resolved = await this.gcsStorage.resolveReadUrl(question.hintImageUrl);
            mediaFields.hintImageUrl = resolved.url ?? question.hintImageUrl;
            if (resolved.storageUri) mediaFields.hintImageStorageUri = resolved.storageUri;
        }

        if (question.explanationImageUrl) {
            const resolved = await this.gcsStorage.resolveReadUrl(
                question.explanationImageUrl,
            );
            mediaFields.explanationImageUrl = resolved.url ?? question.explanationImageUrl;
            if (resolved.storageUri) {
                mediaFields.explanationImageStorageUri = resolved.storageUri;
            }
        }

        return {
            ...question,
            ...mediaFields,
            questionOptions: question.questionOptions
                ? await Promise.all(
                      question.questionOptions.map((option) =>
                          this.withOptionMedia(option),
                      ),
                  )
                : question.questionOptions,
        };
    }

    private validateAnswerKey(
        questionType: QuestionType,
        correctTextAnswer: string | null | undefined,
        options: ReadonlyArray<AnswerKeyOption>,
    ) {
        if (questionType === QuestionType.MULTIPLE_CHOICE) {
            if (correctTextAnswer?.trim()) {
                throw new BadRequestException(
                    'Multiple-choice questions must use options instead of correctTextAnswer',
                );
            }

            if (options.length === 0) {
                throw new BadRequestException(
                    'Multiple-choice questions require at least one option',
                );
            }

            const correctOptionCount = options.filter(
                (option) => option.isCorrect === true,
            ).length;

            if (correctOptionCount !== 1) {
                throw new BadRequestException(
                    'Multiple-choice questions require exactly one correct option',
                );
            }

            return;
        }

        if (
            questionType === QuestionType.SHORT_ANSWER &&
            options.length > 0
        ) {
            throw new BadRequestException(
                'Short-answer questions cannot contain options',
            );
        }
    }
}
