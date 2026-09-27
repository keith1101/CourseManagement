-- Unverified accounts may have been created with a password chosen by a
-- third party before the mailbox owner proved control of the email address.
ALTER TABLE "User"
ALTER COLUMN "passwordHash" DROP NOT NULL;

UPDATE "User"
SET "passwordHash" = NULL
WHERE "emailVerifiedAt" IS NULL;
