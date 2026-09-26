-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DRIVER', 'OFFICE');

-- AlterTable
ALTER TABLE "document_history" ADD COLUMN     "comment" VARCHAR(500);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'DRIVER';
