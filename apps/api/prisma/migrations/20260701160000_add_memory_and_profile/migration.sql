-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male', 'other', 'unspecified');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('family', 'preference', 'life_history', 'routine', 'other');

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "familyContactName" TEXT,
ADD COLUMN     "familyContactRelation" TEXT,
ADD COLUMN     "gender" "Gender";

-- CreateTable
CREATE TABLE "ResidentMemory" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "category" "MemoryCategory" NOT NULL DEFAULT 'other',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEntry" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResidentMemory_residentId_idx" ON "ResidentMemory"("residentId");

-- CreateIndex
CREATE INDEX "ConversationEntry_residentId_idx" ON "ConversationEntry"("residentId");

-- AddForeignKey
ALTER TABLE "ResidentMemory" ADD CONSTRAINT "ResidentMemory_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEntry" ADD CONSTRAINT "ConversationEntry_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
