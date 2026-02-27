import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assigneeLoadScore } from "@/lib/loadScore";
import { getLoadLabel, PROPOSAL_EFFORT_WEIGHTS, type ProposalEffortType } from "@/lib/constants";

// 部員マイページ用サマリー：決定売上・任意額合計・自分の負荷スコア・負荷判定
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const decidedAssignees = await prisma.projectAssignee.findMany({
    where: {
      userId: session.id,
      project: { status: "good", mergedIntoId: null },
    },
    select: {
      businessLevel: true,
      workloadLevel: true,
      judgmentLevel: true,
      project: {
        select: { departmentBudget: true, optionalAmount: true, projectStatus: true },
      },
    },
  });

  const decidedSales = decidedAssignees.reduce((sum, a) => sum + (a.project.departmentBudget ?? 0), 0);

  const optionalProjects = await prisma.project.findMany({
    where: {
      assignees: { some: { userId: session.id } },
      status: "bad",
      mergedIntoId: null,
    },
    select: {
      optionalAmount: true,
    },
  });
  const optionalTotal = optionalProjects.reduce((sum, p) => sum + (p.optionalAmount ?? 0), 0);

  // 決定案件の負荷（完了案件は除外）
  const decidedLoad = assigneeLoadScore(
    decidedAssignees
      .filter((a) => a.project.projectStatus !== "completed")
      .map((a) => ({
        businessLevel: a.businessLevel,
        workloadLevel: a.workloadLevel,
        judgmentLevel: a.judgmentLevel,
      }))
  );

  // 提案案件の負荷（担当者人数で均等割り）
  const proposalAssignees = await prisma.projectAssignee.findMany({
    where: {
      userId: session.id,
      project: { status: "undecided", mergedIntoId: null },
    },
    select: {
      project: {
        select: {
          proposalEffortType: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });

  const proposalLoad = proposalAssignees.reduce((sum, a) => {
    const effortKey = (a.project.proposalEffortType ?? "existing_continuation") as ProposalEffortType;
    const weight = PROPOSAL_EFFORT_WEIGHTS[effortKey] ?? PROPOSAL_EFFORT_WEIGHTS.existing_continuation;
    const assigneeCount = a.project.assignees.length || 1;
    return sum + weight / assigneeCount;
  }, 0);

  const totalLoad = decidedLoad + proposalLoad;
  const loadLabel = getLoadLabel(totalLoad);

  return Response.json({
    department: session.department,
    name: session.name,
    decidedSales,
    optionalTotal,
    loadScore: Math.round(totalLoad * 10) / 10,
    loadLabel,
  });
}
