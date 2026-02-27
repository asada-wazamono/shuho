import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectLoadScore } from "@/lib/loadScore";
import {
  DEPARTMENTS,
  getLoadLabel,
  PROPOSAL_EFFORT_WEIGHTS,
  JUDGMENT_WEIGHT,
} from "@/lib/constants";

type Contributor = {
  projectId: string;
  projectName: string;
  kind: "decided" | "proposal";
  contribution: number;
};

type UserAggregate = {
  userId: string;
  name: string;
  department: string;
  decidedLoad: number;
  proposalLoad: number;
  businessLoadSum: number;
  workloadLoadSum: number;
  judgmentLoadSum: number;
  decidedCount: number;
  proposalCount: number;
  contributors: Contributor[];
};

function rankWithTies<T extends { score: number }>(rows: T[]): Array<T & { rank: number }> {
  let prevScore: number | null = null;
  let prevRank = 0;
  return rows.map((row, idx) => {
    const rank = prevScore !== null && row.score === prevScore ? prevRank : idx + 1;
    prevScore = row.score;
    prevRank = rank;
    return { ...row, rank };
  });
}

function relativeLabel(rank: number, total: number): string {
  if (total <= 0) return "標準";
  const pct = rank / total;
  if (pct <= 0.1) return "集中";
  if (pct <= 0.3) return "高め";
  return "標準";
}

// 全体数値サマリー：部署別売上・件数・負荷、担当者別負荷
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const decided = await prisma.project.findMany({
    where: { status: "good", mergedIntoId: null },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, department: true, role: true } } } },
      duplicateGroup: { include: { projects: { select: { departmentBudget: true } } } },
    },
  });

  const proposal = await prisma.project.findMany({
    where: { status: "undecided", mergedIntoId: null },
    include: { assignees: { include: { user: { select: { id: true, name: true, department: true, role: true } } } } },
  });

  const byDept: Record<string, { sales: number; count: number }> = {};
  for (const d of DEPARTMENTS) {
    byDept[d] = { sales: 0, count: 0 };
  }

  const userAggregate: Record<string, UserAggregate> = {};
  const decidedCounts: Record<string, number> = {};
  const proposalCounts: Record<string, number> = {};

  const users = await prisma.user.findMany({
    where: { role: "staff" },
    select: { id: true, name: true, department: true },
  });
  for (const u of users) {
    userAggregate[u.id] = {
      userId: u.id,
      name: u.name,
      department: u.department,
      decidedLoad: 0,
      proposalLoad: 0,
      businessLoadSum: 0,
      workloadLoadSum: 0,
      judgmentLoadSum: 0,
      decidedCount: 0,
      proposalCount: 0,
      contributors: [],
    };
  }

  for (const p of decided) {
    const dept = p.ownerDepartment;
    const budgetInGroup = p.duplicateGroup?.projects?.length
      ? Math.max(...p.duplicateGroup.projects.map((x) => x.departmentBudget ?? 0))
      : (p.departmentBudget ?? 0);
    const salesContrib = budgetInGroup + (p.optionalAmount ?? 0);
    if (byDept[dept]) {
      byDept[dept].sales += salesContrib;
      byDept[dept].count += 1;
    }
    for (const a of p.assignees) {
      const uid = a.userId;
      const target = userAggregate[uid];
      if (!target) continue;
      const contribution =
        p.projectStatus === "completed"
          ? 0
          : projectLoadScore(a.businessLevel, a.workloadLevel, a.judgmentLevel);
      target.decidedLoad += contribution;
      if (p.projectStatus !== "completed") {
        target.businessLoadSum += a.businessLevel;
        target.workloadLoadSum += a.workloadLevel;
        target.judgmentLoadSum += a.judgmentLevel * JUDGMENT_WEIGHT;
      }
      target.contributors.push({
        projectId: p.id,
        projectName: p.name,
        kind: "decided",
        contribution,
      });
      if (!decidedCounts[uid]) decidedCounts[uid] = 0;
      decidedCounts[uid] += 1;
    }
  }

  for (const p of proposal) {
    const effortKey = (p.proposalEffortType ?? "existing_continuation") as keyof typeof PROPOSAL_EFFORT_WEIGHTS;
    const totalWeight = PROPOSAL_EFFORT_WEIGHTS[effortKey] ?? PROPOSAL_EFFORT_WEIGHTS.existing_continuation;
    const assigneeCount = p.assignees.length || 1;
    const contribution = totalWeight / assigneeCount; // 担当者人数で均等割り
    for (const a of p.assignees) {
      const uid = a.userId;
      const target = userAggregate[uid];
      if (target) {
        target.proposalLoad += contribution;
        target.contributors.push({
          projectId: p.id,
          projectName: p.name,
          kind: "proposal",
          contribution,
        });
      }
      if (!proposalCounts[uid]) proposalCounts[uid] = 0;
      proposalCounts[uid] += 1;
    }
  }

  const totalSales = Object.values(byDept).reduce((s, d) => s + d.sales, 0);

  // 部署別の平均負荷：baseRows 計算後に担当者 totalLoad の平均として算出
  // （決定＋提案の両方を含む、担当者個別スコアベースの正確な値）
  const deptLoadMap: Record<string, { sum: number; count: number }> = {};
  for (const d of DEPARTMENTS) {
    deptLoadMap[d] = { sum: 0, count: 0 };
  }

  const baseRows = users
    .map((u) => {
      const agg = userAggregate[u.id];
      const totalLoad = agg.decidedLoad + agg.proposalLoad;
      return {
        userId: u.id,
        name: u.name,
        department: u.department,
        decidedLoad: agg.decidedLoad,
        proposalLoad: agg.proposalLoad,
        businessLoad: agg.businessLoadSum,
        workloadLoad: agg.workloadLoadSum,
        judgmentLoad: agg.judgmentLoadSum,
        totalLoad,
        absoluteLabel: getLoadLabel(totalLoad),
        decidedCount: decidedCounts[u.id] ?? 0,
        proposalCount: proposalCounts[u.id] ?? 0,
        topContributors: agg.contributors
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3),
      };
    })
    .sort((a, b) => b.totalLoad - a.totalLoad);

  // 部署別avgLoad：担当者の totalLoad（決定＋提案、担当者個別スコアベース）の平均
  for (const row of baseRows) {
    if (deptLoadMap[row.department]) {
      deptLoadMap[row.department].sum += row.totalLoad;
      deptLoadMap[row.department].count += 1;
    }
  }
  const departmentSummary = DEPARTMENTS.map((d) => ({
    department: d,
    sales: byDept[d]?.sales ?? 0,
    count: byDept[d]?.count ?? 0,
    avgLoad: (deptLoadMap[d]?.count ?? 0) > 0
      ? (deptLoadMap[d]!.sum / deptLoadMap[d]!.count).toFixed(1)
      : null,
  }));

  const companyRanked = rankWithTies(
    baseRows.map((r) => ({ ...r, score: r.totalLoad }))
  );
  const companyTotal = companyRanked.length;

  const rowsWithCompany = companyRanked.map((r) => ({
    ...r,
    companyRank: r.rank,
    companyRankLabel: relativeLabel(r.rank, companyTotal),
  }));

  const byDepartmentRows = new Map<string, Array<(typeof rowsWithCompany)[number]>>();
  for (const row of rowsWithCompany) {
    const list = byDepartmentRows.get(row.department) ?? [];
    list.push(row);
    byDepartmentRows.set(row.department, list);
  }

  const deptRankMap = new Map<string, { rank: number; label: string }>();
  for (const [, rows] of Array.from(byDepartmentRows.entries())) {
    const ranked = rankWithTies(rows.sort((a, b) => b.totalLoad - a.totalLoad).map((r) => ({ ...r, score: r.totalLoad })));
    const deptTotal = ranked.length;
    for (const r of ranked) {
      deptRankMap.set(r.userId, {
        rank: r.rank,
        label: relativeLabel(r.rank, deptTotal),
      });
    }
  }

  const assigneeRanking = rowsWithCompany.map((r) => ({
    userId: r.userId,
    name: r.name,
    department: r.department,
    decidedLoad: r.decidedLoad,
    proposalLoad: r.proposalLoad,
    businessLoad: r.businessLoad,
    workloadLoad: r.workloadLoad,
    judgmentLoad: r.judgmentLoad,
    totalLoad: r.totalLoad,
    loadScore: r.totalLoad,
    loadLabel: r.absoluteLabel,
    absoluteLabel: r.absoluteLabel,
    deptRank: deptRankMap.get(r.userId)?.rank ?? 0,
    deptRankLabel: deptRankMap.get(r.userId)?.label ?? "標準",
    companyRank: r.companyRank,
    companyRankLabel: r.companyRankLabel,
    decidedCount: r.decidedCount,
    proposalCount: r.proposalCount,
    topContributors: r.topContributors,
  }));

  return Response.json({
    totalCount: decided.length,
    totalSales,
    departmentSummary,
    assigneeRanking,
  });
}
