import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const subProjects = await prisma.subProject.findMany({
    where: { assignees: { none: {} } },
    select: {
      id: true,
      name: true,
      parent: {
        select: {
          name: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });

  console.log(`担当者なし子案件: ${subProjects.length}件`);

  let fixed = 0;
  let skipped = 0;

  for (const sp of subProjects) {
    const parentAssignees = sp.parent.assignees;
    if (parentAssignees.length === 0) {
      console.log(`  スキップ（親も担当者なし）: ${sp.parent.name} / ${sp.name}`);
      skipped++;
      continue;
    }

    await prisma.subProjectAssignee.createMany({
      data: parentAssignees.map((a) => ({
        subProjectId: sp.id,
        userId: a.userId,
        involvement: "MAIN",
        skillLevel: 2,
      })),
      skipDuplicates: true,
    });
    console.log(`  修正: ${sp.parent.name} / ${sp.name} → ${parentAssignees.length}名追加`);
    fixed++;
  }

  console.log(`\n完了: ${fixed}件修正、${skipped}件スキップ`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
