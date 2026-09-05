-- Preserve assignment history while allowing revoked assignments to release access slots.
ALTER TABLE "ExamAssignment" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ExamAssignment_userId_deletedAt_idx"
ON "ExamAssignment"("userId", "deletedAt");

CREATE INDEX "ExamAssignment_examId_deletedAt_idx"
ON "ExamAssignment"("examId", "deletedAt");
