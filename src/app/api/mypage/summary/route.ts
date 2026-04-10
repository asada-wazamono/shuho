import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcSubProjectLoads, calcProposalLoad } from "@/lib/loadScore";
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
  let decidedLoad = 0;
  let decidedSales = 0;

  for (const sp of mySubProjects) {
    const loads = calcSubProjectLoads(
      sp.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement }))
    );
    decidedLoad += loads[session.id] ?? 0;
    decidedSales += sp.departmentBudget ?? 0;
  }

  // 提案案件の負荷計算（自分が担当者の undecided 案件）
  const myProposalProjects = await prisma.project.findMany({
    where: {
      status: "undecided",
      mergedIntoId: null,
      assignees: { some: { userId: session.id } },
    },
    select: {
      id: true,
      projectType: true,
      totalBudget: true,
      assignees: {
        select: { userId: true, involvement: true },
      },
    },
  });

  let proposalLoad = 0;
  let proposalBudget = 0;
  const proposalCount = myProposalProjects.length;

  for (const p of myProposalProjects) {
    const loads = calcProposalLoad(
      p.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement })),
      p.projectType
    );
    proposalLoad += loads[session.id] ?? 0;
    proposalBudget += p.totalBudget ?? 0;
  }

  decidedLoad = Math.round(decidedLoad * 10) / 10;
  proposalLoad = Math.round(proposalLoad * 10) / 10;
  const totalLoad = Math.round((decidedLoad + proposalLoad) * 10) / 10;

  return Response.json({
    department: session.department,
    name: session.name,
    decidedSales,
    optionalTotal: 0,
    decidedLoad,
    proposalLoad,
    totalLoad,
    loadLabel: getLoadLabel(totalLoad),
    proposalBudget,
    proposalCount,
    // 後方互換
    loadScore: totalLoad,
  });
}
