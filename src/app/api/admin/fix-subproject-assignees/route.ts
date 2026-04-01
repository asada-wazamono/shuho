import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: 担当者が0人の子案件に、親案件の担当者を一括追加する（管理者専用・一回限り）
export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  // 担当者が一人もいない子案件を、親案件の担当者情報ごと取得
  const subProjects = await prisma.subProject.findMany({
    where: {
      assignees: { none: {} },
    },
    select: {
      id: true,
      name: true,
      parent: {
        select: {
          name: true,
          assignees: {
            select: { userId: true },
          },
        },
      },
    },
  });

  let fixed = 0;
  let skipped = 0;

  for (const sp of subProjects) {
    const parentAssignees = sp.parent.assignees;
    if (parentAssignees.length === 0) {
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
    fixed++;
  }

  return Response.json({
    message: `完了：${fixed}件修正、${skipped}件スキップ（親も担当者なし）`,
    fixed,
    skipped,
    total: subProjects.length,
  });
}
