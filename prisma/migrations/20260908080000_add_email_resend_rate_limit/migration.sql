-- AlterTable
ALTER TABLE "User"
    ADD COLUMN "verificationEmailLastRequestedAt" TIMESTAMP(3),
    ADD COLUMN "verificationEmailWindowStartedAt" TIMESTAMP(3),
    ADD COLUMN "verificationEmailRequestCount" INTEGER NOT NULL DEFAULT 0;
