ALTER TYPE "QuestionType" ADD VALUE 'MULTI_PART_SHORT_ANSWER';

CREATE TABLE "QuestionPart" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttemptAnswerPart" (
    "id" TEXT NOT NULL,
    "attemptAnswerId" TEXT NOT NULL,
    "questionPartId" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalizedText" TEXT,
    "numericValue" DOUBLE PRECISION,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttemptAnswerPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionPart_questionId_position_key" ON "QuestionPart"("questionId", "position");
CREATE INDEX "QuestionPart_questionId_idx" ON "QuestionPart"("questionId");
CREATE UNIQUE INDEX "AttemptAnswerPart_attemptAnswerId_questionPartId_key" ON "AttemptAnswerPart"("attemptAnswerId", "questionPartId");
CREATE INDEX "AttemptAnswerPart_questionPartId_idx" ON "AttemptAnswerPart"("questionPartId");

ALTER TABLE "QuestionPart" ADD CONSTRAINT "QuestionPart_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttemptAnswerPart" ADD CONSTRAINT "AttemptAnswerPart_attemptAnswerId_fkey"
  FOREIGN KEY ("attemptAnswerId") REFERENCES "AttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttemptAnswerPart" ADD CONSTRAINT "AttemptAnswerPart_questionPartId_fkey"
  FOREIGN KEY ("questionPartId") REFERENCES "QuestionPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
