/**
 * SQLite → Neon (PostgreSQL) データ移行スクリプト
 *
 * 使い方:
 *   1. .env に以下を設定（移行時のみ）
 *      SQLITE_URL="file:./prisma/dev.db"
 *      DATABASE_URL="<NeonのPooled Connection URL>"
 *      DIRECT_URL="<NeonのDirect Connection URL>"
 *
 *   2. 実行
 *      npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/migrate-sqlite-to-neon.ts
 */

import { PrismaClient as PgClient } from "@prisma/client";
import Database from "better-sqlite3";
import path from "path";

const pg = new PgClient();

const dbPath = path.resolve(__dirname, "dev.db");
const sqlite = new Database(dbPath, { readonly: true });

async function main() {
  console.log("🔗 Neon に接続中...");
  await pg.$connect();
  console.log("✅ 接続OK\n");

  // --- Users ---
  console.log("📋 Users を移行中...");
  const users = sqlite.prepare("SELECT * FROM User").all() as Record<string, unknown>[];
  for (const u of users) {
    await pg.user.upsert({
      where: { id: u.id as string },
      update: {},
      create: {
        id: u.id as string,
        loginId: u.loginId as string,
        passwordHash: u.passwordHash as string,
        name: u.name as string,
        email: u.email as string,
        department: u.department as string,
        role: u.role as string,
        createdAt: new Date(u.createdAt as string),
        updatedAt: new Date(u.updatedAt as string),
      },
    });
  }
  console.log(`  → ${users.length} 件完了\n`);

  // --- Clients ---
  console.log("📋 Clients を移行中...");
  const clients = sqlite.prepare("SELECT * FROM Client").all() as Record<string, unknown>[];
  for (const c of clients) {
    await pg.client.upsert({
      where: { id: c.id as string },
      update: {},
      create: {
        id: c.id as string,
        name: c.name as string,
        department: (c.department as string) ?? null,
        note: (c.note as string) ?? null,
        createdAt: new Date(c.createdAt as string),
        disabledAt: c.disabledAt ? new Date(c.disabledAt as string) : null,
      },
    });
  }
  console.log(`  → ${clients.length} 件完了\n`);

  // --- DuplicateGroups ---
  console.log("📋 DuplicateGroups を移行中...");
  const groups = sqlite.prepare("SELECT * FROM DuplicateGroup").all() as Record<string, unknown>[];
  for (const g of groups) {
    await pg.duplicateGroup.upsert({
      where: { id: g.id as string },
      update: {},
      create: {
        id: g.id as string,
        createdAt: new Date(g.createdAt as string),
      },
    });
  }
  console.log(`  → ${groups.length} 件完了\n`);

  // --- Projects ---
  console.log("📋 Projects を移行中...");
  const projects = sqlite.prepare("SELECT * FROM Project").all() as Record<string, unknown>[];
  for (const p of projects) {
    await pg.project.upsert({
      where: { id: p.id as string },
      update: {},
      create: {
        id: p.id as string,
        duplicateGroupId: (p.duplicateGroupId as string) ?? null,
        isPrimaryInGroup: Boolean(p.isPrimaryInGroup),
        clientId: p.clientId as string,
        name: p.name as string,
        projectType: p.projectType as string,
        certainty: p.certainty as string,
        businessContent: p.businessContent as string,
        businessLevel: p.businessLevel as number,
        workloadLevel: p.workloadLevel as number,
        judgmentLevel: p.judgmentLevel as number,
        totalBudget: (p.totalBudget as number) ?? null,
        departmentBudget: (p.departmentBudget as number) ?? null,
        optionalAmount: (p.optionalAmount as number) ?? null,
        proposalDate: p.proposalDate ? new Date(p.proposalDate as string) : null,
        periodStart: p.periodStart ? new Date(p.periodStart as string) : null,
        periodEnd: p.periodEnd ? new Date(p.periodEnd as string) : null,
        status: p.status as string,
        proposalStatus: (p.proposalStatus as string) ?? null,
        // proposalEffortType removed (field no longer exists)
        projectStatus: (p.projectStatus as string) ?? null,
        statusUpdatedAt: p.statusUpdatedAt ? new Date(p.statusUpdatedAt as string) : null,
        note: (p.note as string) ?? null,
        ownerDepartment: p.ownerDepartment as string,
        mergedIntoId: (p.mergedIntoId as string) ?? null,
        createdAt: new Date(p.createdAt as string),
        updatedAt: new Date(p.updatedAt as string),
      },
    });
  }
  console.log(`  → ${projects.length} 件完了\n`);

  // --- ProjectAssignees ---
  console.log("📋 ProjectAssignees を移行中...");
  const assignees = sqlite.prepare("SELECT * FROM ProjectAssignee").all() as Record<string, unknown>[];
  for (const a of assignees) {
    await pg.projectAssignee.upsert({
      where: { id: a.id as string },
      update: {},
      create: {
        id: a.id as string,
        projectId: a.projectId as string,
        userId: a.userId as string,
        businessLevel: a.businessLevel as number,
        workloadLevel: a.workloadLevel as number,
        judgmentLevel: a.judgmentLevel as number,
      },
    });
  }
  console.log(`  → ${assignees.length} 件完了\n`);

  // --- AiQueryLogs ---
  console.log("📋 AiQueryLogs を移行中...");
  const logs = sqlite.prepare("SELECT * FROM AiQueryLog").all() as Record<string, unknown>[];
  for (const l of logs) {
    await pg.aiQueryLog.upsert({
      where: { id: l.id as string },
      update: {},
      create: {
        id: l.id as string,
        userId: l.userId as string,
        userName: l.userName as string,
        question: l.question as string,
        mode: l.mode as string,
        createdAt: new Date(l.createdAt as string),
      },
    });
  }
  console.log(`  → ${logs.length} 件完了\n`);

  console.log("🎉 移行完了！");
  await pg.$disconnect();
  sqlite.close();
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
