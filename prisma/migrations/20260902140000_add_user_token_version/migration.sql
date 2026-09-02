-- Track password resets so previously issued JWTs can be revoked.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
