/**
 * データ移行スクリプト
 *
 * 実行タイミング：スキーマ変更（add_subproject_hierarchy）適用直後に1回だけ実行する
 *
 * 処理内容：
 * 1. 既存のGood案件（status='good'）に対し、departmentBudgetを持つものは
 *    同名の SubProject を1件自動生成して部門予算・実施期間を移し替える
 * 2. 指名(決定) の projectType を AE提案 に変更
 * 3. 既存の projectStatus を新3値 (active/suspended/completed) にマッピング
 *
 * 実行コマンド：
 *   npx tsx prisma/migrate-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 旧 projectStatus → 新 projectStatus マッピング
const STATUS_MAP: Record<string, string> = {
  preparing:      "active",
  in_progress:    "active",
  waiting_client: "active",
  adjusting:      "active",
  ongoing:        "active",
  on_hold:        "suspended",
  completed:      "completed",
};

async function main() {
  console.log("=== データ移行スクリプト 開始 ===\n");

  // ─── 1. Good案件 → SubProject 自動生成 ──────────────────────
  const goodProjects = await prisma.project.findMany({
    where: { status: "good", mergedIntoId: null },
    select: {
      id: true,
      name: true,
      departmentBudget: true,
      periodStart: true,
      periodEnd: true,
      projectStatus: true,
    },
  });

  console.log(`Good案件: ${goodProjects.length} 件`);

  let subCreated = 0;
  let subSkipped = 0;

  for (const p of goodProjects) {
    // 既にSubProjectがある場合はスキップ
    const existing = await prisma.subProject.findFirst({
      where: { parentId: p.id },
    });
    if (existing) {
      subSkipped++;
      continue;
    }

    // departmentBudgetがない場合は生成しない（任意）
    if (!p.departmentBudget) {
      subSkipped++;
      continue;
    }

    // 新 projectStatus を算出（マッピング）
    const newExecStatus =
      p.projectStatus ? (STATUS_MAP[p.projectStatus] ?? "active") : "active";

    await prisma.subProject.create({
      data: {
        parentId:        p.id,
        name:            p.name,
        status:          newExecStatus === "completed" ? "completed" : "active",
        departmentBudget: p.departmentBudget,
        periodStart:     p.periodStart,
        periodEnd:       p.periodEnd,
      },
    });
    subCreated++;
  }

  console.log(`  SubProject 生成: ${subCreated} 件`);
  console.log(`  SubProject スキップ: ${subSkipped} 件 (既存あり or 部門予算なし)\n`);

  // ─── 2. projectStatus を新3値にマッピング ───────────────────
  const allProjects = await prisma.project.findMany({
    where: { projectStatus: { not: null } },
    select: { id: true, projectStatus: true },
  });

  let statusUpdated = 0;
  for (const p of allProjects) {
    const newStatus = p.projectStatus
      ? (STATUS_MAP[p.projectStatus] ?? "active")
      : null;
    if (newStatus && newStatus !== p.projectStatus) {
      await prisma.project.update({
        where: { id: p.id },
        data: { projectStatus: newStatus },
      });
      statusUpdated++;
    }
  }
  console.log(`projectStatus マッピング更新: ${statusUpdated} 件\n`);

  // ─── 3. 指名(決定) → AE提案 ─────────────────────────────────
  const renamed = await prisma.project.updateMany({
    where: { projectType: "指名(決定)" },
    data: { projectType: "AE提案" },
  });
  console.log(`指名(決定) → AE提案 変更: ${renamed.count} 件\n`);

  console.log("=== データ移行スクリプト 完了 ===");
}

main()
  .catch((e) => {
    console.error("エラー:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
