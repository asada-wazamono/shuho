-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" DATETIME
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "duplicateGroupId" TEXT,
    "isPrimaryInGroup" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "certainty" TEXT NOT NULL,
    "businessContent" TEXT NOT NULL,
    "businessLevel" INTEGER NOT NULL,
    "workloadLevel" INTEGER NOT NULL,
    "judgmentLevel" INTEGER NOT NULL,
    "totalBudget" REAL,
    "departmentBudget" REAL,
    "optionalAmount" REAL,
    "proposalDate" DATETIME,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'undecided',
    "note" TEXT,
    "ownerDepartment" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mergedIntoId" TEXT,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_duplicateGroupId_fkey" FOREIGN KEY ("duplicateGroupId") REFERENCES "DuplicateGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectAssignee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ProjectAssignee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignee_projectId_userId_key" ON "ProjectAssignee"("projectId", "userId");
