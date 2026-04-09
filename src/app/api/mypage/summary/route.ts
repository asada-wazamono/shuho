import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcSubProjectLoads } from "@/lib/loadScore";
import { getLoadLabel, type Involvement } from "@/lib/constants";

// 部員マイページ用サマリー：決定売上・自分の負荷スコア・負荷判定
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 自分がアサインされている進行中の子案件（チーム全員の情報も取得）
  const mySubProjects = await prisma.subProject.findMany({
    where: {
      status: "active",
      parent: { status: "good", mergedIntoId: null },
      assignees: { some: { userId: session.id } },
    },
    select: {
      id: true,
      departmentBudget: true,
      assignees: {
        select: { userId: true, involvement: true },
      },
    },
  });

  // チーム構成按分で自分のスコアを計算
  let loadScore = 0;
  let decidedSales = 0;

  for (const sp of mySubProjects) {
    const loads = calcSubProjectLoads(
      sp.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement }))
    );
    loadScore += loads[session.id] ?? 0;
    decidedSales += sp.departmentBudget ?? 0;
  }

  return Response.json({
    department: session.department,
    name: session.name,
    decidedSales,
    optionalTotal: 0,
    loadScore: Math.round(loadScore * 10) / 10,
    loadLabel: getLoadLabel(loadScore),
  });
}
