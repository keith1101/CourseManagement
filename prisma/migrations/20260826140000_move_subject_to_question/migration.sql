-- Preserve the existing subject assignment by moving it from each exam to its questions.
ALTER TABLE "Question" ADD COLUMN "subjectId" TEXT;

UPDATE "Question" AS q
SET "subjectId" = e."subjectId"
FROM "Exam" AS e
WHERE q."examId" = e."id";

ALTER TABLE "Question" ALTER COLUMN "subjectId" SET NOT NULL;

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Question_subjectId_idx" ON "Question"("subjectId");

ALTER TABLE "Exam" DROP CONSTRAINT "Exam_subjectId_fkey";
DROP INDEX "Exam_subjectId_idx";
ALTER TABLE "Exam" DROP COLUMN "subjectId";
