-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "proposalStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "statusUpdatedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
