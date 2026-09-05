import { QuestionType } from '../../generated/client/enums';

// Student question payloads are an allowlist. Answer keys and explanations
// are intentionally absent so new Question fields cannot leak by default.
export const studentQuestionSelect = {
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
  questionOptions: {
    select: {
      id: true,
      contentText: true,
      imageUrl: true,
      position: true,
    },
    orderBy: {
      position: 'asc' as const,
    },
  },
} as const;

export type StudentQuestionOption = {
  id: string;
  contentText: string;
  imageUrl?: string | null;
  position: number;
  imageStorageUri?: string;
};

export type StudentQuestion = {
  id: string;
  examId: string;
  subjectId: string;
  questionType: QuestionType;
  contentText: string;
  imageUrl?: string | null;
  hintImageUrl?: string | null;
  hint?: string | null;
  instruction?: string | null;
  timeLimitSeconds?: number | null;
  position: number;
  questionOptions?: StudentQuestionOption[];
};

export function sanitizeStudentQuestion(question: StudentQuestion) {
  return {
    id: question.id,
    examId: question.examId,
    subjectId: question.subjectId,
    questionType: question.questionType,
    contentText: question.contentText,
    imageUrl: question.imageUrl ?? null,
    hintImageUrl: question.hintImageUrl ?? null,
    hint: question.hint ?? null,
    instruction: question.instruction ?? null,
    timeLimitSeconds: question.timeLimitSeconds ?? null,
    position: question.position,
    questionOptions: (question.questionOptions ?? []).map((option) => ({
      id: option.id,
      contentText: option.contentText,
      imageUrl: option.imageUrl ?? null,
      position: option.position,
      ...(option.imageStorageUri
        ? { imageStorageUri: option.imageStorageUri }
        : {}),
    })),
  };
}

export function sanitizeStudentQuestionOption(option: StudentQuestionOption) {
  return {
    id: option.id,
    contentText: option.contentText,
    imageUrl: option.imageUrl ?? null,
    position: option.position,
    ...(option.imageStorageUri
      ? { imageStorageUri: option.imageStorageUri }
      : {}),
  };
}
