-- Server-authoritative sequential exam progress.
CREATE TYPE "AttemptQuestionStatus" AS ENUM ('LOCKED', 'ACTIVE', 'CORRECT', 'INCORRECT', 'TIMED_OUT', 'COMPLETED');

ALTER TABLE "ExamAttempt"
  ADD COLUMN "flowVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "progressVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentAttemptQuestionId" TEXT;

CREATE TABLE "AttemptQuestionProgress" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "timeLimitSeconds" INTEGER NOT NULL,
  "status" "AttemptQuestionStatus" NOT NULL DEFAULT 'LOCKED',
  "activatedAt" TIMESTAMP(3),
  "deadlineAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "advanceAfter" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "isCorrect" BOOLEAN,
  "timedOut" BOOLEAN NOT NULL DEFAULT false,
  "lastAdvanceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttemptQuestionProgress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AttemptAnswer"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "timedOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "submissionKey" TEXT;

CREATE UNIQUE INDEX "ExamAttempt_currentAttemptQuestionId_key"
  ON "ExamAttempt"("currentAttemptQuestionId");
CREATE UNIQUE INDEX "AttemptQuestionProgress_attemptId_questionId_key"
  ON "AttemptQuestionProgress"("attemptId", "questionId");
CREATE UNIQUE INDEX "AttemptQuestionProgress_attemptId_ordinal_key"
  ON "AttemptQuestionProgress"("attemptId", "ordinal");
CREATE INDEX "AttemptQuestionProgress_attemptId_status_idx"
  ON "AttemptQuestionProgress"("attemptId", "status");
CREATE UNIQUE INDEX "AttemptQuestionProgress_attemptId_lastAdvanceKey_key"
  ON "AttemptQuestionProgress"("attemptId", "lastAdvanceKey");
CREATE INDEX "AttemptAnswer_attemptId_questionId_idx"
  ON "AttemptAnswer"("attemptId", "questionId");
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_submissionKey_key"
  ON "AttemptAnswer"("attemptId", "submissionKey");

ALTER TABLE "AttemptQuestionProgress"
  ADD CONSTRAINT "AttemptQuestionProgress_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttemptQuestionProgress_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExamAttempt"
  ADD CONSTRAINT "ExamAttempt_currentAttemptQuestionId_fkey"
  FOREIGN KEY ("currentAttemptQuestionId") REFERENCES "AttemptQuestionProgress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
