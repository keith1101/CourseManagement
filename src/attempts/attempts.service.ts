import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    AnswerValueType,
    AttemptQuestionStatus,
    AttemptStatus,
    QuestionType,
} from '../../generated/client/enums';
import { Prisma } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { AttemptQueryDto } from './dto/attempt-query.dto';
import { SaveAttemptAnswerDto } from './dto/save-attempt-answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SequentialAnswerDto } from './dto/sequential-answer.dto';
import { SequentialContinueDto } from './dto/sequential-continue.dto';
import {
    StudentQuestion,
    StudentQuestionOption,
    sanitizeStudentQuestion,
    sanitizeStudentQuestionOption,
    studentQuestionSelect,
} from '../questions/question-response';

const studentAttemptAnswerSelect = {
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
        select: studentQuestionSelect,
    },
    selectedOption: {
        select: {
            id: true,
            contentText: true,
            imageUrl: true,
            position: true,
        },
    },
    partAnswers: {
        select: {
            questionPartId: true,
            rawValue: true,
            normalizedText: true,
            numericValue: true,
            isCorrect: true,
            questionPart: { select: { id: true, contentText: true, position: true } },
        },
        orderBy: { questionPart: { position: 'asc' as const } },
    },
} as const;

const studentResultAttemptAnswerSelect = {
    ...studentAttemptAnswerSelect,
    isCorrect: true,
} as const;

// Completed student results retain aggregate scoring and submitted values,
// but follow the least-disclosure policy for answer keys and explanations.
const studentResultSelect = {
    id: true,
    userId: true,
    examId: true,
    assignmentId: true,
    status: true,
    flowVersion: true,
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
        select: studentResultAttemptAnswerSelect,
        orderBy: {
            position: 'asc' as const,
        },
    },
} as const;

type StudentAttemptAnswer = {
    id: string;
    questionId: string;
    selectedOptionId: string | null;
    answerType: AnswerValueType;
    rawValue: string;
    normalizedText: string | null;
    content: string | null;
    numericValue: number | null;
    isCorrect?: boolean;
    position: number;
    createdAt?: Date;
    updatedAt?: Date;
    question?: StudentQuestion | null;
    selectedOption?: StudentQuestionOption | null;
    partAnswers?: Array<{
        questionPartId: string;
        rawValue: string;
        normalizedText: string | null;
        numericValue: number | null;
        isCorrect?: boolean;
        questionPart: { id: string; contentText: string; position: number };
    }>;
};

const attemptDetailSelect = {
    id: true,
    userId: true,
    examId: true,
    assignmentId: true,
    status: true,
    flowVersion: true,
    progressVersion: true,
    currentAttemptQuestionId: true,
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
        select: studentAttemptAnswerSelect,
        orderBy: {
            position: 'asc' as const,
        },
    },
} as const;

const sequentialProgressSelect = {
    id: true,
    attemptId: true,
    questionId: true,
    ordinal: true,
    timeLimitSeconds: true,
    status: true,
    activatedAt: true,
    deadlineAt: true,
    submittedAt: true,
    advanceAfter: true,
    completedAt: true,
    isCorrect: true,
    timedOut: true,
    lastAdvanceKey: true,
} as const;

const sequentialQuestionEvaluationSelect = {
    ...studentQuestionSelect,
    correctTextAnswer: true,
    explaination: true,
    explanationImageUrl: true,
    questionOptions: {
        select: {
            id: true,
            contentText: true,
            imageUrl: true,
            position: true,
            isCorrect: true,
        },
        orderBy: { position: 'asc' as const },
    },
    questionAcceptedAnswers: {
        select: {
            answerType: true,
            rawValue: true,
            normalizedText: true,
            numericValue: true,
            isPrimary: true,
        },
        orderBy: { position: 'asc' as const },
    },
    questionParts: {
        select: { id: true, contentText: true, correctAnswer: true, position: true },
        orderBy: { position: 'asc' as const },
    },
} as const;

@Injectable()
export class AttemptsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly r2Storage: R2StorageService,
    ) {}

    /**
     * Roll out sequential attempts independently from the legacy contract.
     * Existing attempts keep their persisted flowVersion forever.
     */
    private get sequentialFlowEnabled() {
        return process.env.SEQUENTIAL_EXAM_FLOW_ENABLED === 'true';
    }

    /**
     * v2 mutations lock their ExamAttempt row before reading progress (see
     * getSequentialMutationState). Read committed is sufficient once every
     * mutation takes that same lock, and it makes concurrent submit/
     * continue requests wait for the first request instead of creating an SSI
     * serialization cycle. Keep the retry for transient deadlocks and adapter
     * conflicts that can still occur when the database is under load.
     */
    private async runSequentialTransaction<T>(
        callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            try {
                return await this.prisma.$transaction(callback, {
                    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
                });
            } catch (error: any) {
                if (!this.isSequentialSerializationFailure(error)) {
                    throw error;
                }
                if (attempt === maxRetries - 1) {
                    throw new ConflictException(
                        'Exam progress is busy; retry the current action',
                    );
                }
                await new Promise((resolve) =>
                    setTimeout(resolve, 25 * 2 ** attempt),
                );
            }
        }
        throw new ConflictException('Exam progress is busy; retry the current action');
    }

    private isSequentialSerializationFailure(error: any) {
        const originalCode =
            error?.cause?.originalCode ??
            error?.cause?.code ??
            error?.originalCode ??
            error?.code;
        return (
            error?.code === 'P2034' ||
            // A concurrent request using the same idempotency key can surface
            // as a unique-constraint race in some adapter versions. Retrying
            // lets the second request observe and replay the committed row.
            error?.code === 'P2002' ||
            originalCode === '40001' ||
            originalCode === '40P01' ||
            error?.cause?.kind === 'TransactionWriteConflict'
        );
    }

    async start(
        examId: string,
        userId: string,
        startAttemptDto: StartAttemptDto,
    ): Promise<any> {
        const [exam, user] = await Promise.all([
            this.prisma.exam.findUnique({
                where: { id: examId, deletedAt: null },
                select: {
                    id: true,
                    status: true,
                    title: true,
                    accessLevel: true,
                },
            }),
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    accessLevel: true,
                    proExpiresAt: true,
                },
            }),
        ]);

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        if (exam.status !== 'PUBLISHED') {
            throw new ForbiddenException('Exam is not published');
        }

        const isPro =
            user?.accessLevel === 'PRO' &&
            (!user.proExpiresAt || user.proExpiresAt.getTime() > Date.now());

        if (exam.accessLevel === 'PRO' && !isPro) {
            throw new ForbiddenException({
                code: 'EXAM_REQUIRES_PRO',
                message: 'Tài khoản miễn phí không thể làm đề thi PRO. Vui lòng nâng cấp qua Zalo!',
            });
        }

        let assignmentId = startAttemptDto.assignmentId;

        if (assignmentId) {
            const assignment = await this.prisma.examAssignment.findUnique({
                where: { id: assignmentId, deletedAt: null },
                select: {
                    id: true,
                    userId: true,
                    examId: true,
                    dueAt: true,
                },
            });

            if (!assignment || assignment.userId !== userId || assignment.examId !== examId) {
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
                    deletedAt: null,
                    dueAt: { gt: new Date() },
                },
                orderBy: { dueAt: 'asc' },
                select: { id: true, dueAt: true },
            });

            if (assignment) {
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
            select: { id: true, flowVersion: true },
        });

        if (existingAttempt) {
            return existingAttempt.flowVersion === 2
                ? this.getSequentialSession(existingAttempt.id, userId)
                : this.getAttemptWithQuestions(existingAttempt.id, userId);
        }

        if (this.sequentialFlowEnabled) {
            return this.createSequentialAttempt(examId, userId, assignmentId);
        }

        const totalQuestions = await this.countExamScoreUnits(this.prisma, examId);

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
                exam: { is: { deletedAt: null } },
            },
            select: {
                id: true,
                userId: true,
                examId: true,
                assignmentId: true,
                status: true,
                flowVersion: true,
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
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
    }

    async findOne(id: string, userId?: string) {
        const attempt = await this.getAttempt(id, userId);
        if (attempt.flowVersion === 2 && userId) {
            return this.getSequentialSession(id, userId);
        }
        const result = await this.prisma.examAttempt.findUnique({
            where: { id: attempt.id },
            select: attemptDetailSelect,
        });

        return result ? this.withAttemptMedia(result) : result;
    }

    async saveAnswer(
        attemptId: string,
        userId: string,
        saveAttemptAnswerDto: SaveAttemptAnswerDto,
    ) {
        const attempt = await this.getAttempt(attemptId, userId);

        if (attempt.flowVersion === 2) {
            throw new ConflictException({
                code: 'SEQUENTIAL_FLOW_REQUIRED',
                message: 'Use the current-question endpoints for this attempt',
            });
        }

        if (attempt.status !== AttemptStatus.IN_PROGRESS) {
            throw new ConflictException('Attempt is no longer in progress');
        }

        if (!saveAttemptAnswerDto.finalize && !saveAttemptAnswerDto.timedOut) {
            throw new BadRequestException(
                'Answers can only be saved when submitted or timed out',
            );
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
                correctTextAnswer: true,
                questionOptions: {
                    select: {
                        id: true,
                        contentText: true,
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
                questionParts: {
                    select: { id: true, contentText: true, correctAnswer: true, position: true },
                    orderBy: { position: 'asc' },
                },
            },
        });

        if (!question) {
            throw new NotFoundException('Question not found for this exam');
        }

        if (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER) {
            return this.saveMultipartAnswer(
                attemptId,
                question as any,
                saveAttemptAnswerDto.parts ?? [],
                !!saveAttemptAnswerDto.timedOut,
            );
        }

        // Treat an empty form value as no selection. Persisting `''` would
        // violate the nullable foreign key on AttemptAnswer.selectedOptionId.
        const selectedOptionId = saveAttemptAnswerDto.selectedOptionId?.trim() || undefined;
        const selectedOption = selectedOptionId
            ? question.questionOptions.find(
                  (option) => option.id === selectedOptionId,
              )
            : undefined;

        if (selectedOptionId && !selectedOption) {
            throw new BadRequestException(
                'selectedOptionId must belong to a question option in this exam',
            );
        }

        if (question.questionType === QuestionType.MULTIPLE_CHOICE && !saveAttemptAnswerDto.timedOut) {
            if (!selectedOptionId || !selectedOption) {
                throw new BadRequestException(
                    'A valid selectedOptionId is required for multiple-choice questions',
                );
            }
        } else if (!saveAttemptAnswerDto.timedOut && !saveAttemptAnswerDto.rawValue?.trim()) {
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
        const shouldEvaluate =
            saveAttemptAnswerDto.finalize === true ||
            saveAttemptAnswerDto.timedOut === true;
        const isCorrect = shouldEvaluate
            ? saveAttemptAnswerDto.timedOut
                ? false
                : this.isAnswerCorrect(question, {
                      selectedOptionId: selectedOptionId ?? null,
                      answerType,
                      rawValue,
                      normalizedText,
                      numericValue: saveAttemptAnswerDto.numericValue ?? null,
                  })
            : false;

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

        // Grading is persisted for final submission, but never returned while
        // the attempt is still in progress.
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
            timedOut: !!saveAttemptAnswerDto.timedOut,
        };
    }

    /** Create a server-owned question sequence for a new version-2 attempt. */
    private async createSequentialAttempt(
        examId: string,
        userId: string,
        assignmentId?: string,
    ) {
        const questions = await this.prisma.question.findMany({
            where: { examId, deletedAt: null },
            select: {
                id: true,
                position: true,
                timeLimitSeconds: true,
                questionType: true,
                questionParts: { select: { id: true } },
            },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
        });

        if (questions.length === 0) {
            throw new BadRequestException('Exam has no questions');
        }

        const startedAt = new Date();
        const attemptId = await this.runSequentialTransaction(
            async (transaction) => {
                const attempt = await transaction.examAttempt.create({
                    data: {
                        userId,
                        examId,
                        assignmentId,
                        totalQuestions: this.countScoreUnits(questions),
                        flowVersion: 2,
                        progressVersion: 0,
                        startedAt,
                    },
                    select: { id: true },
                });

                await transaction.attemptQuestionProgress.createMany({
                    data: questions.map((question, index) => {
                        const timeLimitSeconds = Math.max(
                            1,
                            question.timeLimitSeconds || 30,
                        );
                        const active = index === 0;
                        return {
                            attemptId: attempt.id,
                            questionId: question.id,
                            ordinal: index,
                            timeLimitSeconds,
                            status: active
                                ? AttemptQuestionStatus.ACTIVE
                                : AttemptQuestionStatus.LOCKED,
                            activatedAt: active ? startedAt : null,
                            deadlineAt: active
                                ? new Date(
                                      startedAt.getTime() +
                                          timeLimitSeconds * 1000,
                                  )
                                : null,
                        };
                    }),
                });

                const first = await transaction.attemptQuestionProgress.findUniqueOrThrow({
                    where: {
                        attemptId_ordinal: {
                            attemptId: attempt.id,
                            ordinal: 0,
                        },
                    },
                    select: { id: true },
                });

                await transaction.examAttempt.update({
                    where: { id: attempt.id },
                    data: { currentAttemptQuestionId: first.id },
                });

                return attempt.id;
            },
        );

        return this.getSequentialSession(attemptId, userId);
    }

    async getSequentialSession(attemptId: string, userId: string) {
        await this.syncSequentialProgress(attemptId, userId);

        const attempt = (await this.prisma.examAttempt.findUnique({
            where: { id: attemptId },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
                flowVersion: true,
                progressVersion: true,
                totalQuestions: true,
                startedAt: true,
                currentAttemptQuestionId: true,
                exam: { select: { id: true, title: true, status: true } },
                currentAttemptQuestion: {
                    select: {
                        ...sequentialProgressSelect,
                        question: { select: studentQuestionSelect },
                    },
                },
                attemptQuestionProgress: {
                    select: sequentialProgressSelect,
                    orderBy: { ordinal: 'asc' },
                },
            },
        })) as any;

        if (!attempt || attempt.userId !== userId || attempt.flowVersion !== 2) {
            throw new NotFoundException('Sequential attempt not found');
        }

        const current = attempt.currentAttemptQuestion;
        let currentQuestion: Record<string, unknown> | null = null;

        if (current) {
            const decoratedQuestion = await this.withQuestionMedia(
                current.question as StudentQuestion,
            );
            const feedback =
                current.status === AttemptQuestionStatus.CORRECT ||
                current.status === AttemptQuestionStatus.INCORRECT ||
                current.status === AttemptQuestionStatus.TIMED_OUT
                    ? await this.getSequentialFeedback(
                          current.questionId,
                          current.status === AttemptQuestionStatus.CORRECT,
                          current.status === AttemptQuestionStatus.TIMED_OUT,
                          await this.getStoredPartAnswers(attempt.id, current.questionId),
                      )
                    : undefined;

            currentQuestion = {
                id: current.questionId,
                ordinal: current.ordinal + 1,
                status: current.status,
                activatedAt: current.activatedAt?.toISOString() ?? null,
                deadlineAt: current.deadlineAt?.toISOString() ?? null,
                advanceAfter: current.advanceAfter?.toISOString() ?? null,
                question: sanitizeStudentQuestion(decoratedQuestion),
                ...(feedback ? { feedback } : {}),
            };
        }

        return {
            id: attempt.id,
            attemptId: attempt.id,
            userId: attempt.userId,
            examId: attempt.examId,
            flowVersion: attempt.flowVersion,
            attemptStatus: attempt.status,
            progressVersion: attempt.progressVersion,
            totalQuestions: attempt.totalQuestions,
            startedAt: attempt.startedAt.toISOString(),
            currentOrdinal: current ? current.ordinal + 1 : null,
            serverNow: new Date().toISOString(),
            navigator: attempt.attemptQuestionProgress.map((progress: any) => ({
                ordinal: progress.ordinal + 1,
                status: progress.status,
            })),
            currentQuestion,
            ...(attempt.status === AttemptStatus.COMPLETED
                ? { resultUrl: `/student/attempts/${attempt.id}/result` }
                : {}),
        };
    }

    async submitSequentialAnswer(
        attemptId: string,
        userId: string,
        dto: SequentialAnswerDto,
        idempotencyKey: string,
        receivedAt = new Date(),
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }

        const outcome = await this.runSequentialTransaction(
            async (transaction) => {
                const state = await this.getSequentialMutationState(
                    transaction,
                    attemptId,
                    userId,
                );

                const replay = await transaction.attemptAnswer.findFirst({
                    where: { attemptId, submissionKey: idempotencyKey },
                    select: { id: true, questionId: true },
                });
                if (replay) {
                    // Replaying while the same question is still visible
                    // returns the original logical grading outcome. Once the
                    // attempt has advanced, return a fresh session instead so
                    // the client cannot move backwards.
                    if (state.current?.questionId === replay.questionId) {
                        const progress = await transaction.attemptQuestionProgress.findUnique({
                            where: {
                                attemptId_questionId: {
                                    attemptId,
                                    questionId: replay.questionId,
                                },
                            },
                            select: {
                                status: true,
                                isCorrect: true,
                                timedOut: true,
                                advanceAfter: true,
                            },
                        });
                        if (progress && progress.status !== AttemptQuestionStatus.ACTIVE) {
                            return {
                                kind: 'replay' as const,
                                questionId: replay.questionId,
                                isCorrect: progress.isCorrect === true,
                                timedOut: progress.timedOut,
                                advanceAfter: progress.advanceAfter,
                                progressVersion: state.progressVersion,
                            };
                        }
                    }
                    return { kind: 'session' as const };
                }

                const onTimeTimeoutRace = !!state.current &&
                    state.current.status === AttemptQuestionStatus.TIMED_OUT &&
                    !!state.current.deadlineAt &&
                    receivedAt.getTime() < state.current.deadlineAt.getTime() &&
                    !!state.current.submittedAt &&
                    receivedAt.getTime() < state.current.submittedAt.getTime() &&
                    dto.progressVersion === state.progressVersion - 1 &&
                    state.current.questionId === dto.questionId;
                if (!onTimeTimeoutRace) {
                    this.assertSequentialVersion(state, dto.questionId, dto.progressVersion);
                }
                if (state.status === AttemptStatus.COMPLETED) {
                    return { kind: 'completed' as const };
                }
                if (!state.current ||
                    (state.current.status !== AttemptQuestionStatus.ACTIVE && !onTimeTimeoutRace)) {
                    throw new ConflictException('Question is no longer accepting submissions');
                }

                const question = await this.getSequentialQuestionForEvaluation(
                    transaction,
                    state.examId,
                    state.current.questionId,
                );
                const timedOut = !!state.current.deadlineAt &&
                    receivedAt.getTime() >= state.current.deadlineAt.getTime();
                const answer = this.buildSequentialAnswerData(question, dto, !timedOut);
                const isCorrect = !timedOut &&
                    (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                        ? (answer.partAnswers ?? []).every((part: any) => part.isCorrect)
                        : this.isAnswerCorrect(question, {
                            selectedOptionId: answer.selectedOptionId,
                            answerType: answer.answerType,
                            rawValue: answer.rawValue,
                            normalizedText: answer.normalizedText,
                            numericValue: answer.numericValue,
                        }));

                await this.persistSequentialAnswer(
                    transaction,
                    state,
                    answer,
                    isCorrect,
                    timedOut,
                    receivedAt,
                    idempotencyKey,
                );

                const status = timedOut
                    ? AttemptQuestionStatus.TIMED_OUT
                    : isCorrect
                    ? AttemptQuestionStatus.CORRECT
                    : AttemptQuestionStatus.INCORRECT;
                const advanceAfter = isCorrect && !timedOut
                    ? new Date(receivedAt.getTime() + 3000)
                    : null;
                await transaction.attemptQuestionProgress.update({
                    where: { id: state.current.id },
                    data: {
                        status,
                        isCorrect,
                        timedOut,
                        submittedAt: receivedAt,
                        advanceAfter,
                    },
                });
                await transaction.examAttempt.update({
                    where: { id: attemptId },
                    data: { progressVersion: { increment: 1 } },
                });
                return {
                    kind: 'graded' as const,
                    questionId: state.current.questionId,
                    isCorrect,
                    timedOut,
                    advanceAfter,
                    progressVersion: state.progressVersion + 1,
                    partAnswers: answer.partAnswers ?? [],
                };
            },
        );

        if (outcome.kind === 'session' || outcome.kind === 'completed') {
            return this.getSequentialSession(attemptId, userId);
        }

        return {
            attemptId,
            questionId: outcome.questionId,
            status: outcome.timedOut
                ? AttemptQuestionStatus.TIMED_OUT
                : outcome.isCorrect
                ? AttemptQuestionStatus.CORRECT
                : AttemptQuestionStatus.INCORRECT,
            isCorrect: outcome.isCorrect,
            timedOut: outcome.timedOut,
            advanceAfter: outcome.advanceAfter?.toISOString() ?? null,
            progressVersion: outcome.progressVersion,
            feedback: await this.getSequentialFeedback(
                outcome.questionId,
                outcome.isCorrect,
                outcome.timedOut,
                outcome.kind === 'graded' ? (outcome as any).partAnswers : undefined,
            ),
        };
    }

    async expireSequentialQuestion(attemptId: string, userId: string) {
        await this.syncSequentialProgress(attemptId, userId);
        return this.getSequentialSession(attemptId, userId);
    }

    async continueSequentialQuestion(
        attemptId: string,
        userId: string,
        dto: SequentialContinueDto,
        idempotencyKey: string,
        now = new Date(),
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }

        await this.runSequentialTransaction(
            async (transaction) => {
                const state = await this.getSequentialMutationState(
                    transaction,
                    attemptId,
                    userId,
                );
                const replay = await transaction.attemptQuestionProgress.findFirst({
                    where: { attemptId, lastAdvanceKey: idempotencyKey },
                    select: { id: true },
                });
                if (replay) return;

                this.assertSequentialVersion(state, dto.questionId, dto.progressVersion);
                if (state.status === AttemptStatus.COMPLETED) return;
                if (!state.current) {
                    throw new ConflictException('Attempt has no active question');
                }
                const canContinueCorrect =
                    state.current.status === AttemptQuestionStatus.CORRECT &&
                    !!state.current.advanceAfter &&
                    now.getTime() >= state.current.advanceAfter.getTime();
                const canContinueIncorrect =
                    state.current.status === AttemptQuestionStatus.INCORRECT ||
                    state.current.status === AttemptQuestionStatus.TIMED_OUT;
                if (!canContinueCorrect && !canContinueIncorrect) {
                    throw new ConflictException('Question cannot be continued yet');
                }

                await transaction.attemptQuestionProgress.update({
                    where: { id: state.current.id },
                    data: {
                        status: AttemptQuestionStatus.COMPLETED,
                        completedAt: now,
                        lastAdvanceKey: idempotencyKey,
                    },
                });

                const next = await transaction.attemptQuestionProgress.findFirst({
                    where: {
                        attemptId,
                        ordinal: { gt: state.current.ordinal },
                    },
                    orderBy: { ordinal: 'asc' },
                    select: { id: true, timeLimitSeconds: true },
                });

                if (next) {
                    await transaction.attemptQuestionProgress.update({
                        where: { id: next.id },
                        data: {
                            status: AttemptQuestionStatus.ACTIVE,
                            activatedAt: now,
                            deadlineAt: new Date(
                                now.getTime() + next.timeLimitSeconds * 1000,
                            ),
                        },
                    });
                    await transaction.examAttempt.update({
                        where: { id: attemptId },
                        data: {
                            currentAttemptQuestionId: next.id,
                            progressVersion: { increment: 1 },
                        },
                    });
                    return;
                }

                const correctCount = await this.countSequentialCorrectUnits(transaction, attemptId);
                await transaction.examAttempt.update({
                    where: { id: attemptId },
                    data: {
                        status: AttemptStatus.COMPLETED,
                        submittedAt: now,
                        correctCount,
                        currentAttemptQuestionId: null,
                        progressVersion: { increment: 1 },
                    },
                });
            },
        );

        return this.getSequentialSession(attemptId, userId);
    }

    async submit(attemptId: string, userId: string) {
        const attempt = await this.getAttempt(attemptId, userId);

        if (attempt.flowVersion === 2) {
            throw new ConflictException({
                code: 'SEQUENTIAL_FLOW_REQUIRED',
                message: 'Use the current-question endpoints for this attempt',
            });
        }

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
                questionParts: {
                    select: { id: true, contentText: true, correctAnswer: true, position: true },
                    orderBy: { position: 'asc' },
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
                partAnswers: {
                    select: { questionPartId: true, rawValue: true, normalizedText: true, numericValue: true },
                },
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

            const isCorrect = question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                ? this.gradeMultipartAnswers(question.questionParts, answer.partAnswers, false).every((part) => part.isCorrect)
                : this.isAnswerCorrect(question, answer);
            const correctUnits = question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                ? this.gradeMultipartAnswers(question.questionParts, answer.partAnswers, false)
                    .filter((part) => part.isCorrect).length
                : Number(isCorrect);
            return [{ answer, isCorrect, correctUnits }];
        });
        const correctCount = evaluations.reduce(
            (total, evaluation) => total + evaluation.correctUnits,
            0,
        );

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
            select: studentResultSelect,
        });

        if (!result) {
            throw new NotFoundException('Attempt not found');
        }

        const questions = await this.prisma.question.findMany({
            where: { examId: result.examId, deletedAt: null },
            select: studentQuestionSelect,
            orderBy: { position: 'asc' },
        });

        const [decoratedResult, decoratedQuestions] = await Promise.all([
            this.withAttemptMedia(result, true),
            Promise.all(questions.map((question) => this.withQuestionMedia(question))),
        ]);

        const persistedCorrectCount = decoratedResult.attemptedAnswers?.reduce(
            (total, answer) => total +
                (answer.question?.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                    ? answer.partAnswers?.filter((part) => part.isCorrect === true).length ?? 0
                    : Number(answer.isCorrect === true)),
            0,
        ) ?? 0;
        if (persistedCorrectCount !== result.correctCount) {
            throw new ConflictException('Attempt result is inconsistent');
        }

        const partKeys = await this.prisma.questionPart.findMany({
            where: { question: { examId: result.examId, deletedAt: null } },
            select: { id: true, correctAnswer: true },
        });
        const correctAnswerByPartId = new Map(
            partKeys.map((part) => [part.id, part.correctAnswer]),
        );

        return {
            ...decoratedResult,
            attemptedAnswers: decoratedResult.attemptedAnswers?.map((answer) => ({
                ...answer,
                ...(answer.question?.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                    ? {
                        partFeedback: (answer.partAnswers ?? []).map((part) => ({
                            partId: part.questionPartId,
                            isCorrect: part.isCorrect === true,
                            ...(part.isCorrect === true
                                ? {}
                                : { correctAnswer: correctAnswerByPartId.get(part.questionPartId) ?? null }),
                        })),
                    }
                    : {}),
            })),
            questions: decoratedQuestions.map((question) =>
                sanitizeStudentQuestion(question),
            ),
            percentage:
                result.totalQuestions === 0
                    ? 0
                    : Math.round(
                          (result.correctCount / result.totalQuestions) * 10000,
                      ) / 100,
        };
    }

    private async syncSequentialProgress(
        attemptId: string,
        userId: string,
    ) {
        // Most session reads happen while the current question is still active
        // and do not need to mutate anything. Avoid opening a write-capable
        // transaction in that hot path; doing so under Serializable isolation
        // made harmless refresh requests collide with submissions.
        // The transaction below remains the authoritative check for the small
        // window where a deadline or correct-answer grace period has elapsed.
        const snapshot = await this.prisma.examAttempt.findUnique({
            where: { id: attemptId },
            select: {
                userId: true,
                flowVersion: true,
                status: true,
                currentAttemptQuestion: {
                    select: {
                        status: true,
                        deadlineAt: true,
                        advanceAfter: true,
                    },
                },
            },
        });
        const current = snapshot?.currentAttemptQuestion;
        const now = new Date();
        const needsSynchronization = !!snapshot &&
            snapshot.userId === userId &&
            snapshot.flowVersion === 2 &&
            snapshot.status === AttemptStatus.IN_PROGRESS &&
            !!current &&
            ((current.status === AttemptQuestionStatus.ACTIVE &&
                !!current.deadlineAt &&
                now.getTime() >= current.deadlineAt.getTime()) ||
                (current.status === AttemptQuestionStatus.CORRECT &&
                    !!current.advanceAfter &&
                    now.getTime() >= current.advanceAfter.getTime()));

        if (
            snapshot &&
            snapshot.userId === userId &&
            snapshot.flowVersion === 2 &&
            !needsSynchronization
        ) {
            return;
        }

        await this.runSequentialTransaction(
            async (transaction) => {
                const state = await this.getSequentialMutationState(
                    transaction,
                    attemptId,
                    userId,
                );
                if (state.status !== AttemptStatus.IN_PROGRESS || !state.current) return;

                const now = new Date();
                if (
                    state.current.status === AttemptQuestionStatus.ACTIVE &&
                    state.current.deadlineAt &&
                    now.getTime() >= state.current.deadlineAt.getTime()
                ) {
                    await this.markSequentialTimeout(transaction, state, now);
                    return;
                }

                if (
                    state.current.status === AttemptQuestionStatus.CORRECT &&
                    state.current.advanceAfter &&
                    now.getTime() >= state.current.advanceAfter.getTime()
                ) {
                    await this.completeSequentialCurrent(transaction, state, now);
                }
            },
        );
    }

    private async getSequentialMutationState(
        transaction: Prisma.TransactionClient,
        attemptId: string,
        userId: string,
    ): Promise<any> {
        // A single attempt is the unit of progress. Lock it before reading
        // the version/current question so concurrent requests (including an
        // concurrent submits) are serialized deterministically.
        // Keep the guard for lightweight unit-test transaction doubles; the
        // real Prisma transaction client always exposes $queryRaw.
        if (typeof (transaction as any).$queryRaw === 'function') {
            await (transaction as any).$queryRaw`
                SELECT "id"
                FROM "ExamAttempt"
                WHERE "id" = ${attemptId}
                  AND "userId" = ${userId}
                FOR UPDATE
            `;
        }
        const state = await transaction.examAttempt.findUnique({
            where: { id: attemptId },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
                flowVersion: true,
                progressVersion: true,
                currentAttemptQuestionId: true,
            },
        });

        if (!state || state.userId !== userId) {
            throw new NotFoundException('Attempt not found');
        }
        if (state.flowVersion !== 2) {
            throw new ConflictException({
                code: 'FLOW_VERSION_MISMATCH',
                message: 'This attempt uses the legacy exam flow',
            });
        }
        // Keep transaction reads sequential. Prisma's pg adapter uses one
        // client connection per interactive transaction; nested relation
        // reads can otherwise overlap on that connection and surface as
        // "client.query() when the client is already executing" warnings.
        const current = state.currentAttemptQuestionId
            ? await transaction.attemptQuestionProgress.findUnique({
                  where: { id: state.currentAttemptQuestionId },
                  select: sequentialProgressSelect,
              })
            : null;
        const mutableState = { ...state, current } as any;
        if (mutableState.current) {
            mutableState.current.answer = await transaction.attemptAnswer.findFirst({
                where: { attemptId, questionId: mutableState.current.questionId },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    selectedOptionId: true,
                    answerType: true,
                    rawValue: true,
                    normalizedText: true,
                    content: true,
                    numericValue: true,
                    submittedAt: true,
                    timedOut: true,
                },
            });
        }
        return mutableState;
    }

    private assertSequentialVersion(
        state: any,
        questionId: string,
        progressVersion: number,
    ) {
        if (
            state.progressVersion !== progressVersion ||
            !state.current ||
            state.current.questionId !== questionId
        ) {
            throw new ConflictException({
                code: 'STALE_PROGRESS',
                message: 'The exam progress has changed. Reload the current question.',
                currentQuestionId: state.current?.questionId ?? null,
                progressVersion: state.progressVersion,
            });
        }
    }

    private async getSequentialQuestionForEvaluation(
        transaction: Prisma.TransactionClient,
        examId: string,
        questionId: string,
    ): Promise<any> {
        const question = await transaction.question.findFirst({
            where: { id: questionId, examId, deletedAt: null },
            select: {
                id: true,
                examId: true,
                subjectId: true,
                questionType: true,
                contentText: true,
                imageUrl: true,
                hintImageUrl: true,
                hint: true,
                instruction: true,
                timeLimitSeconds: true,
                position: true,
                correctTextAnswer: true,
                explaination: true,
                explanationImageUrl: true,
                questionParts: {
                    select: { id: true, contentText: true, correctAnswer: true, position: true },
                    orderBy: { position: 'asc' },
                },
            },
        });
        if (!question) {
            throw new NotFoundException('Question not found for this exam');
        }

        // Do not use a nested include inside the interactive transaction. The
        // explicit reads are deterministic and avoid overlapping pg client
        // queries while retaining the full grading data needed by the state
        // machine.
        const questionOptions = await transaction.questionOption.findMany({
            where: { questionId },
            select: {
                id: true,
                contentText: true,
                imageUrl: true,
                position: true,
                isCorrect: true,
            },
            orderBy: { position: 'asc' },
        });
        const questionAcceptedAnswers = await transaction.questionAcceptedAnswer.findMany({
            where: { questionId },
            select: {
                answerType: true,
                rawValue: true,
                normalizedText: true,
                numericValue: true,
                isPrimary: true,
            },
            orderBy: { position: 'asc' },
        });
        const questionParts = await transaction.questionPart.findMany({
            where: { questionId },
            select: { id: true, contentText: true, correctAnswer: true, position: true },
            orderBy: { position: 'asc' },
        });
        return { ...question, questionOptions, questionAcceptedAnswers, questionParts };
    }

    private async persistSequentialAnswer(
        transaction: Prisma.TransactionClient,
        state: any,
        answer: any,
        isCorrect: boolean,
        timedOut: boolean,
        submittedAt: Date | null,
        submissionKey: string | null,
    ) {
        const existing = await transaction.attemptAnswer.findFirst({
            where: {
                attemptId: state.id,
                questionId: state.current.questionId,
            },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
        });
        const { partAnswers, ...answerData } = answer;
        const data = {
            ...answerData,
            position: state.current.ordinal,
            isCorrect,
            timedOut,
            submittedAt,
            ...(submissionKey !== null ? { submissionKey } : {}),
        };
        let attemptAnswerId: string;
        if (existing) {
            await transaction.attemptAnswer.update({
                where: { id: existing.id },
                data,
            });
            attemptAnswerId = existing.id;
        } else {
            const created = await transaction.attemptAnswer.create({
                data: {
                    attemptId: state.id,
                    questionId: state.current.questionId,
                    ...data,
                },
                select: { id: true },
            });
            attemptAnswerId = created.id;
        }
        if (partAnswers) {
            await this.replacePartAnswers(transaction, attemptAnswerId, partAnswers);
        }
    }

    private buildSequentialAnswerData(
        question: any,
        dto: SequentialAnswerDto,
        requireAnswer: boolean,
    ) {
        if (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER) {
            const partAnswers = this.gradeMultipartAnswers(
                question.questionParts,
                dto.parts ?? [],
                requireAnswer,
            );
            return {
                selectedOptionId: null,
                answerType: AnswerValueType.TEXT,
                rawValue: '',
                normalizedText: '',
                content: null,
                numericValue: null,
                partAnswers,
            };
        }

        const selectedOptionId = dto.selectedOptionId?.trim() || null;
        const selectedOption = selectedOptionId
            ? question.questionOptions.find((option: any) => option.id === selectedOptionId)
            : undefined;

        if (selectedOptionId && !selectedOption) {
            throw new BadRequestException(
                'selectedOptionId must belong to the current question',
            );
        }

        const isChoice = question.questionType === QuestionType.MULTIPLE_CHOICE;
        const rawValue = (dto.rawValue ?? selectedOption?.contentText ?? '').trim();
        if (requireAnswer && isChoice && !selectedOptionId) {
            throw new BadRequestException(
                'A valid selectedOptionId is required for multiple-choice questions',
            );
        }
        if (requireAnswer && !isChoice && !rawValue) {
            throw new BadRequestException(
                'rawValue is required for short-answer questions',
            );
        }

        const answerType = dto.answerType ??
            (dto.numericValue !== undefined ? AnswerValueType.NUMBER : AnswerValueType.TEXT);
        return {
            selectedOptionId,
            answerType,
            rawValue,
            normalizedText: dto.normalizedText?.trim() || this.normalize(rawValue),
            content: dto.content ?? null,
            numericValue: dto.numericValue ?? null,
        };
    }

    private async markSequentialTimeout(
        transaction: Prisma.TransactionClient,
        state: any,
        now: Date,
        dto?: SequentialAnswerDto,
    ) {
        if (!state.current) return;
        const question = await this.getSequentialQuestionForEvaluation(
            transaction,
            state.examId,
            state.current.questionId,
        );

        const answer = dto
            ? this.buildSequentialAnswerData(question, dto, false)
            : state.current.answer
            ? {
                  selectedOptionId: state.current.answer.selectedOptionId,
                  answerType: state.current.answer.answerType,
                  rawValue: state.current.answer.rawValue,
                  normalizedText: state.current.answer.normalizedText ??
                      this.normalize(state.current.answer.rawValue),
                  content: state.current.answer.content,
                  numericValue: state.current.answer.numericValue,
              }
            : {
                  selectedOptionId: null,
                  answerType: AnswerValueType.TEXT,
                  rawValue: '',
                  normalizedText: '',
                  content: null,
                  numericValue: null,
              };

        await this.persistSequentialAnswer(
            transaction,
            state,
            answer,
            false,
            true,
            now,
            null,
        );

        await transaction.attemptQuestionProgress.update({
            where: { id: state.current.id },
            data: {
                status: AttemptQuestionStatus.TIMED_OUT,
                isCorrect: false,
                timedOut: true,
                submittedAt: now,
                advanceAfter: null,
            },
        });
        await transaction.examAttempt.update({
            where: { id: state.id },
            data: { progressVersion: { increment: 1 } },
        });
    }

    private async completeSequentialCurrent(
        transaction: Prisma.TransactionClient,
        state: any,
        now: Date,
        advanceKey?: string,
    ) {
        if (!state.current) return;
        await transaction.attemptQuestionProgress.update({
            where: { id: state.current.id },
            data: {
                status: AttemptQuestionStatus.COMPLETED,
                completedAt: now,
                lastAdvanceKey: advanceKey ?? undefined,
            },
        });

        const next = await transaction.attemptQuestionProgress.findFirst({
            where: {
                attemptId: state.id,
                ordinal: { gt: state.current.ordinal },
            },
            orderBy: { ordinal: 'asc' },
            select: { id: true, timeLimitSeconds: true },
        });

        if (next) {
            await transaction.attemptQuestionProgress.update({
                where: { id: next.id },
                data: {
                    status: AttemptQuestionStatus.ACTIVE,
                    activatedAt: now,
                    deadlineAt: new Date(now.getTime() + next.timeLimitSeconds * 1000),
                },
            });
            await transaction.examAttempt.update({
                where: { id: state.id },
                data: {
                    currentAttemptQuestionId: next.id,
                    progressVersion: { increment: 1 },
                },
            });
            return;
        }

        const correctCount = await this.countSequentialCorrectUnits(transaction, state.id);
        await transaction.examAttempt.update({
            where: { id: state.id },
            data: {
                status: AttemptStatus.COMPLETED,
                submittedAt: now,
                correctCount,
                currentAttemptQuestionId: null,
                progressVersion: { increment: 1 },
            },
        });
    }

    private async getSequentialFeedback(
        questionId: string,
        isCorrect: boolean,
        timedOut: boolean,
        submittedParts?: Array<{ questionPartId: string; rawValue: string; isCorrect: boolean }>,
    ) {
        const question = await this.prisma.question.findUnique({
            where: { id: questionId },
            select: sequentialQuestionEvaluationSelect,
        });
        if (!question) throw new NotFoundException('Question not found');

        const feedback: Record<string, unknown> = {
            questionId,
            isCorrect,
            timedOut,
        };
        if (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER) {
            const submittedById = new Map(
                (submittedParts ?? []).map((part) => [part.questionPartId, part]),
            );
            feedback.parts = question.questionParts.map((part: any) => {
                const answer = submittedById.get(part.id);
                return {
                    partId: part.id,
                    isCorrect: answer?.isCorrect === true,
                    correctAnswer: answer?.isCorrect === true ? undefined : part.correctAnswer,
                };
            });
            return feedback;
        }
        if (isCorrect) return feedback;

        const decorated = await this.withQuestionMedia(question as any);
        const correctOption = question.questionOptions.find((option: any) => option.isCorrect);
        const primaryAccepted = question.questionAcceptedAnswers.find(
            (answer: any) => answer.isPrimary,
        ) ?? question.questionAcceptedAnswers[0];

        if (correctOption) {
            feedback.correctOptionId = correctOption.id;
            feedback.correctAnswer = {
                id: correctOption.id,
                content: correctOption.contentText,
            };
        }
        if (question.correctTextAnswer || primaryAccepted) {
            feedback.correctTextAnswer = question.correctTextAnswer ?? primaryAccepted?.rawValue;
        }
        feedback.guidance = {
            text: question.hint ?? null,
            image: (decorated as any).hintImageUrl ?? null,
        };
        feedback.explanation = {
            text: question.explaination ?? null,
            image: await this.resolveOptionalMedia(question.explanationImageUrl),
        };
        return feedback;
    }

    private async getStoredPartAnswers(attemptId: string, questionId: string) {
        const answer = await this.prisma.attemptAnswer.findFirst({
            where: { attemptId, questionId },
            select: {
                partAnswers: {
                    select: { questionPartId: true, rawValue: true, isCorrect: true },
                },
            },
        });
        return answer?.partAnswers;
    }

    private async resolveOptionalMedia(value: string | null | undefined) {
        if (!value) return null;
        const resolved = await this.r2Storage.resolveReadUrl(value);
        return resolved.url;
    }

    private async getAttempt(id: string, userId?: string) {
        const attempt = await this.prisma.examAttempt.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
                flowVersion: true,
                progressVersion: true,
                currentAttemptQuestionId: true,
                exam: {
                    select: { deletedAt: true },
                },
            },
        });

        if (
            !attempt ||
            attempt.exam?.deletedAt ||
            (userId && attempt.userId !== userId)
        ) {
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
            select: studentQuestionSelect,
            orderBy: {
                position: 'asc',
            },
        });

        const decoratedQuestions = await Promise.all(
            questions.map((question) => this.withQuestionMedia(question)),
        );

        return {
            ...attempt,
            questions: decoratedQuestions.map((question) =>
                sanitizeStudentQuestion(question),
            ),
        };
    }

    private async withOptionMedia<T extends StudentQuestionOption>(
        option: T,
    ) {
        if (!option.imageUrl) return option;

        const resolved = await this.r2Storage.resolveReadUrl(option.imageUrl);
        return {
            ...option,
            imageUrl: resolved.url,
            ...(resolved.storageUri
                ? { imageStorageUri: resolved.storageUri }
                : {}),
        };
    }

    private async withQuestionMedia<T extends StudentQuestion>(question: T) {
        const mediaFields: Record<string, string | null> = {};

        if (question.imageUrl) {
            const resolved = await this.r2Storage.resolveReadUrl(question.imageUrl);
            mediaFields.imageUrl = resolved.url;
            if (resolved.storageUri) mediaFields.imageStorageUri = resolved.storageUri;
        }

        if (question.hintImageUrl) {
            const resolved = await this.r2Storage.resolveReadUrl(question.hintImageUrl);
            mediaFields.hintImageUrl = resolved.url;
            if (resolved.storageUri) mediaFields.hintImageStorageUri = resolved.storageUri;
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

    private async withAttemptMedia<T extends {
        attemptedAnswers?: StudentAttemptAnswer[];
    }>(attempt: T, includeCorrectness = false) {
        if (!attempt.attemptedAnswers) return attempt;

        return {
            ...attempt,
            attemptedAnswers: await Promise.all(attempt.attemptedAnswers.map(
                async (answer) => ({
                    id: answer.id,
                    questionId: answer.questionId,
                    selectedOptionId: answer.selectedOptionId,
                    answerType: answer.answerType,
                    rawValue: answer.rawValue,
                    normalizedText: answer.normalizedText,
                    content: answer.content,
                    numericValue: answer.numericValue,
                    ...(includeCorrectness ? { isCorrect: answer.isCorrect === true } : {}),
                    partAnswers: answer.partAnswers?.map((part) => ({
                        partId: part.questionPartId,
                        rawValue: part.rawValue,
                        normalizedText: part.normalizedText,
                        numericValue: part.numericValue,
                        ...(includeCorrectness ? { isCorrect: part.isCorrect === true } : {}),
                        part: part.questionPart,
                    })),
                    position: answer.position,
                    ...(answer.createdAt ? { createdAt: answer.createdAt } : {}),
                    ...(answer.updatedAt ? { updatedAt: answer.updatedAt } : {}),
                    question: answer.question
                        ? sanitizeStudentQuestion(
                              await this.withQuestionMedia(answer.question),
                          )
                        : answer.question,
                    selectedOption: answer.selectedOption
                        ? sanitizeStudentQuestionOption(
                              await this.withOptionMedia(answer.selectedOption),
                          )
                        : answer.selectedOption,
                }),
            )),
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

    private async saveMultipartAnswer(
        attemptId: string,
        question: any,
        submittedParts: Array<{ partId: string; rawValue: string }>,
        timedOut: boolean,
    ): Promise<any> {
        const partAnswers = this.gradeMultipartAnswers(
            question.questionParts,
            submittedParts,
            !timedOut,
        );
        const isCorrect = !timedOut && partAnswers.every((part) => part.isCorrect);
        const existing = await this.prisma.attemptAnswer.findFirst({
            where: { attemptId, questionId: question.id },
            select: { id: true },
        });
        const data = {
            selectedOptionId: null,
            answerType: AnswerValueType.TEXT,
            rawValue: '',
            normalizedText: '',
            content: null,
            numericValue: null,
            isCorrect,
            position: question.position,
            timedOut,
        };
        const answer = existing
            ? await this.prisma.attemptAnswer.update({ where: { id: existing.id }, data })
            : await this.prisma.attemptAnswer.create({
                data: { attemptId, questionId: question.id, ...data },
            });
        await this.replacePartAnswers(this.prisma, answer.id, partAnswers);
        return {
            id: answer.id,
            attemptId,
            questionId: question.id,
            partAnswers: partAnswers.map((part) => ({
                partId: part.questionPartId,
                rawValue: part.rawValue,
            })),
        };
    }

    private gradeMultipartAnswers(
        questionParts: Array<{ id: string; correctAnswer: string }>,
        submittedParts: Array<{ partId?: string; questionPartId?: string; rawValue: string }>,
        requireAllParts: boolean,
    ) {
        const submittedById = new Map<string, string>();
        for (const part of submittedParts) {
            const partId = part.partId ?? part.questionPartId;
            if (!partId) throw new BadRequestException('partId is required');
            if (submittedById.has(partId)) {
                throw new BadRequestException('Each question part can only be answered once');
            }
            submittedById.set(partId, part.rawValue ?? '');
        }
        const expectedIds = new Set(questionParts.map((part) => part.id));
        if ([...submittedById.keys()].some((id) => !expectedIds.has(id))) {
            throw new BadRequestException('partId must belong to the current question');
        }
        if (requireAllParts && submittedById.size !== questionParts.length) {
            throw new BadRequestException('An answer is required for every question part');
        }
        return questionParts.map((part) => {
            const rawValue = submittedById.get(part.id) ?? '';
            const numericValue = this.toExactNumber(rawValue);
            const correctNumericValue = this.toExactNumber(part.correctAnswer);
            const isCorrect = numericValue !== null && correctNumericValue !== null
                ? numericValue === correctNumericValue
                : this.normalizeTextAnswer(rawValue) === this.normalizeTextAnswer(part.correctAnswer);
            return {
                questionPartId: part.id,
                rawValue,
                normalizedText: this.normalizeTextAnswer(rawValue),
                numericValue,
                isCorrect,
            };
        });
    }

    private async replacePartAnswers(
        db: any,
        attemptAnswerId: string,
        partAnswers: Array<{
            questionPartId: string;
            rawValue: string;
            normalizedText: string;
            numericValue: number | null;
            isCorrect: boolean;
        }>,
    ) {
        await db.attemptAnswerPart.deleteMany({ where: { attemptAnswerId } });
        if (partAnswers.length > 0) {
            await db.attemptAnswerPart.createMany({
                data: partAnswers.map((part) => ({ attemptAnswerId, ...part })),
            });
        }
    }

    private countScoreUnits(questions: Array<{ questionType: QuestionType; questionParts?: Array<unknown> }>) {
        return questions.reduce(
            (total, question) => total +
                (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                    ? question.questionParts?.length ?? 0
                    : 1),
            0,
        );
    }

    private async countExamScoreUnits(db: any, examId: string) {
        const questions = await db.question.findMany({
            where: { examId, deletedAt: null },
            select: { questionType: true, questionParts: { select: { id: true } } },
        });
        return this.countScoreUnits(questions);
    }

    private async countSequentialCorrectUnits(db: any, attemptId: string) {
        const answers = await db.attemptAnswer.findMany({
            where: { attemptId },
            select: {
                isCorrect: true,
                question: { select: { questionType: true } },
                partAnswers: { select: { isCorrect: true } },
            },
        });
        return answers.reduce((total: number, answer: any) => total +
            (answer.question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER
                ? answer.partAnswers.filter((part: any) => part.isCorrect).length
                : Number(answer.isCorrect)), 0);
    }

    private toExactNumber(value: string): number | null {
        const trimmed = value.trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
        const number = Number(trimmed);
        return Number.isFinite(number) ? number : null;
    }

    private normalizeTextAnswer(value: string) {
        return value
            .trim()
            .toLocaleLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, '');
    }

    private normalize(value: string) {
        return value.trim().toLocaleLowerCase();
    }
}
