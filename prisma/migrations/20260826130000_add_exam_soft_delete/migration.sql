ALTER TABLE "Exam" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Exam_deletedAt_idx" ON "Exam"("deletedAt");
