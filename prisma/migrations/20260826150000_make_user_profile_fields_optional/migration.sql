-- Phone number and date of birth are optional during registration.
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
