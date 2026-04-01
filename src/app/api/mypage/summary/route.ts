import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assigneeLoadScore } from "@/lib/loadScore";
import { getLoadLabel, type Involvement, type SkillLevel } from "@/lib/constants";

// 部員マイページ用サマリー：決定売上・自分の負荷スコア・負荷判定
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 自分がアサインされている進行中の子案件
  const mySubAssignees = await prisma.subProjectAssignee.findMany({
    where: {
      userId: session.id,
      subProject: {
        status: "active", // 完了を除外
        parent: { status: "good", mergedIntoId: null },
      },
    },
    select: {
      involvement: true,
      skillLevel: true,
      subProject: {
        select: {
          id: true,
          name: true,
          departmentBudget: true,
          parent: { select: { id: true, name: true, optionalAmount: true } },
        },
      },
    },
  });

  // 負荷スコア計算（2軸マトリクス）
  const loadScore = assigneeLoadScore(
    mySubAssignees.map((a) => ({
      involvement: a.involvement as Involvement,
      skillLevel: a.skillLevel as SkillLevel,
    }))
  );

  // 売上：自分が担当する子案件の部門予算合計
  // （optionalAmount は親案件レベルで加算。担当者が複数でも全額カウント）
  const decidedSales = mySubAssignees.reduce(
    (sum, a) => sum + (a.subProject.departmentBudget ?? 0),
    0
  );

  // 自分が担当する Good 親案件の optionalAmount 合計
  const myGoodProjects = await prisma.projectAssignee.findMany({
    where: {
      userId: session.id,
      project: { status: "good", mergedIntoId: null },
    },
    select: { project: { select: { optionalAmount: true } } },
  });
  const optionalTotal = myGoodProjects.reduce(
    (sum, a) => sum + (a.project.optionalAmount ?? 0),
    0
  );

  return Response.json({
    department: session.department,
    name: session.name,
    decidedSales,
    optionalTotal,
    loadScore: Math.round(loadScore * 10) / 10,
    loadLabel: getLoadLabel(loadScore),
  });
}
