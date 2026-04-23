import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentFiscalYear, fiscalYearRange } from "@/lib/fiscalYear";
import { calcSubProjectLoads, calcProposalLoad } from "@/lib/loadScore";
import { DEPARTMENTS, getLoadLabel, type Involvement } from "@/lib/constants";

export type DecidedEntry = {
  subProjectId: string;
  subProjectName: string;
  parentProjectId: string;
  parentProjectName: string;
  clientName: string;
  involvement: string;
  load: number;
  departmentBudget: number | null;
};

export type ProposalEntry = {
  projectId: string;
  projectName: string;
  clientName: string;
  projectType: string;
  involvement: string;
  load: number;
  totalBudget: number | null;
};

type UserAggregate = {
  userId: string;
  name: string;
  department: string;
  decidedLoad: number;
  decidedBudget: number;
  proposalLoad: number;
  proposalBudget: number;
  proposalCount: number;
  subProjectCount: number;
  decidedEntries: DecidedEntry[];
  proposalEntries: ProposalEntry[];
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

/** 負荷値を 0〜100 のパーセンタイルに変換（最大=100, 最小=0, 同値は同スコア） */
function calcPctMap(rows: { userId: string; load: number }[]): Map<string, number> {
  const n = rows.length;
  const map = new Map<string, number>();
  if (n === 0) return map;
  if (n === 1) { map.set(rows[0].userId, 0); return map; }
  const sorted = [...rows].sort((a, b) => b.load - a.load);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && sorted[j].load === sorted[i].load) j++;
    const avgIdx = (i + j - 1) / 2;
    const pct = Math.round((1 - avgIdx / (n - 1)) * 100);
    for (let k = i; k < j; k++) map.set(sorted[k].userId, pct);
    i = j;
  }
  return map;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fyParam = searchParams.get("fy");
  const fy = fyParam ? parseInt(fyParam, 10) : currentFiscalYear();
  const { start, end } = fiscalYearRange(fy);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, department: true },
  });

  const subProjects = await prisma.subProject.findMany({
    where: {
      parent: { status: "good", mergedIntoId: null },
    },
    include: {
      parent: { select: { id: true, name: true, ownerDepartment: true, departmentBudget: true, optionalAmount: true, client: { select: { name: true } } } },
      assignees: { include: { user: { select: { id: true, name: true, department: true } } } },
    },
  });

  const userAgg: Record<string, UserAggregate> = {};
  for (const u of users) {
    userAgg[u.id] = {
      userId: u.id, name: u.name, department: u.department,
      decidedLoad: 0, decidedBudget: 0,
      proposalLoad: 0, proposalBudget: 0,
      proposalCount: 0, subProjectCount: 0,
      decidedEntries: [], proposalEntries: [],
    };
  }

  // 部署別売上集計（会計年度フィルター：periodStart が FY 内の子案件のみ）
  const byDept: Record<string, { sales: number; count: number }> = {};
  for (const d of DEPARTMENTS) byDept[d] = { sales: 0, count: 0 };

  const fySubProjects = await prisma.subProject.findMany({
    where: {
      parent: { status: "good", mergedIntoId: null },
      periodStart: { gte: start, lte: end },
    },
    select: {
      departmentBudget: true,
      parent: {
        select: {
          id: true,
          ownerDepartment: true,
          isPrimaryInGroup: true,
          duplicateGroupId: true,
        },
      },
    },
  });

  const countedProjectIds = new Set<string>();
  for (const sp of fySubProjects) {
    const p = sp.parent;
    if (p.duplicateGroupId && !p.isPrimaryInGroup) continue;
    const dept = p.ownerDepartment;
    if (byDept[dept]) {
      byDept[dept].sales += sp.departmentBudget ?? 0;
      if (!countedProjectIds.has(p.id)) {
        byDept[dept].count += 1;
        countedProjectIds.add(p.id);
      }
    }
  }

  // 担当者別 決定負荷・予算集計
  // 負荷は進行中の子案件のみ、売上（予算）は完了済みも含めて集計する
  for (const sp of subProjects) {
    const isActive = sp.status === "active";
    const loads = isActive
      ? calcSubProjectLoads(
          sp.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement }))
        )
      : {};
    for (const a of sp.assignees) {
      const target = userAgg[a.userId];
      if (!target) continue;
      // 売上は完了済みも含める
      target.decidedBudget += sp.departmentBudget ?? 0;
      // 負荷・件数・エントリーは進行中のみ
      if (isActive) {
        const load = loads[a.userId] ?? 0;
        target.decidedLoad += load;
        target.subProjectCount += 1;
        target.decidedEntries.push({
          subProjectId: sp.id,
          subProjectName: sp.name,
          parentProjectId: sp.parent.id,
          parentProjectName: sp.parent.name,
          clientName: sp.parent.client.name,
          involvement: a.involvement,
          load,
          departmentBudget: sp.departmentBudget,
        });
      }
    }
  }

  // 提案案件の負荷・予算集計
  const proposalProjects = await prisma.project.findMany({
    where: { status: "undecided", mergedIntoId: null },
    select: {
      id: true,
      name: true,
      projectType: true,
      totalBudget: true,
      client: { select: { name: true } },
      assignees: { select: { userId: true, involvement: true } },
    },
  });

  for (const p of proposalProjects) {
    const loads = calcProposalLoad(
      p.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement })),
      p.projectType
    );
    for (const a of p.assignees) {
      const target = userAgg[a.userId];
      if (!target) continue;
      const load = loads[a.userId] ?? 0;
      target.proposalLoad += load;
      target.proposalBudget += p.totalBudget ?? 0;
      target.proposalCount += 1;
      target.proposalEntries.push({
        projectId: p.id,
        projectName: p.name,
        clientName: p.client.name,
        projectType: p.projectType,
        involvement: a.involvement,
        load,
        totalBudget: p.totalBudget,
      });
    }
  }

  const totalSales = Object.values(byDept).reduce((s, d) => s + d.sales, 0);

  // baseRows 生成
  const baseRows = users.map((u) => {
    const agg = userAgg[u.id];
    const decidedLoad = Math.round(agg.decidedLoad * 10) / 10;
    const proposalLoad = Math.round(agg.proposalLoad * 10) / 10;
    const totalLoad = Math.round((decidedLoad + proposalLoad) * 10) / 10;
    return {
      userId: u.id,
      name: u.name,
      department: u.department,
      decidedLoad,
      decidedBudget: agg.decidedBudget,
      proposalLoad,
      proposalBudget: agg.proposalBudget,
      proposalCount: agg.proposalCount,
      totalLoad,
      subProjectCount: agg.subProjectCount,
      absoluteLabel: getLoadLabel(totalLoad),
      decidedEntries: agg.decidedEntries.sort((a, b) => b.load - a.load),
      proposalEntries: agg.proposalEntries.sort((a, b) => b.load - a.load),
      score: totalLoad,
    };
  }).sort((a, b) => b.totalLoad - a.totalLoad);

  // 総合スコア（合計負荷のパーセンタイル）
  const totalPctMap = calcPctMap(baseRows.map(r => ({ userId: r.userId, load: r.totalLoad })));
  const decidedPctMap = calcPctMap(baseRows.map(r => ({ userId: r.userId, load: r.decidedLoad })));
  const proposalPctMap = calcPctMap(baseRows.map(r => ({ userId: r.userId, load: r.proposalLoad })));

  // 部署別 avgLoad
  const deptLoadMap: Record<string, { sum: number; count: number }> = {};
  for (const d of DEPARTMENTS) deptLoadMap[d] = { sum: 0, count: 0 };
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

  // ランキング（全社・部署内）
  const companyRanked = rankWithTies(baseRows);
  const companyTotal = companyRanked.length;
  const rowsWithCompany = companyRanked.map((r) => ({
    ...r,
    companyRank: r.rank,
    companyRankLabel: relativeLabel(r.rank, companyTotal),
  }));

  const byDeptRows = new Map<string, typeof rowsWithCompany>();
  for (const row of rowsWithCompany) {
    const list = byDeptRows.get(row.department) ?? [];
    list.push(row);
    byDeptRows.set(row.department, list);
  }
  const deptRankMap = new Map<string, { rank: number; label: string }>();
  for (const [, rows] of Array.from(byDeptRows.entries())) {
    const ranked = rankWithTies(rows.sort((a, b) => b.totalLoad - a.totalLoad));
    const deptTotal = ranked.length;
    for (const r of ranked) {
      deptRankMap.set(r.userId, { rank: r.rank, label: relativeLabel(r.rank, deptTotal) });
    }
  }

  const assigneeRanking = rowsWithCompany.map((r) => {
    const decidedPct = decidedPctMap.get(r.userId) ?? 0;
    const proposalPct = proposalPctMap.get(r.userId) ?? 0;
    const compositeScore = totalPctMap.get(r.userId) ?? 0;
    return {
      userId: r.userId,
      name: r.name,
      department: r.department,
      compositeScore,
      decidedPct,
      proposalPct,
      decidedLoad: r.decidedLoad,
      decidedBudget: r.decidedBudget,
      proposalLoad: r.proposalLoad,
      proposalBudget: r.proposalBudget,
      proposalCount: r.proposalCount,
      totalLoad: r.totalLoad,
      absoluteLabel: r.absoluteLabel,
      subProjectCount: r.subProjectCount,
      deptRank: deptRankMap.get(r.userId)?.rank ?? 0,
      deptRankLabel: deptRankMap.get(r.userId)?.label ?? "標準",
      companyRank: r.companyRank,
      companyRankLabel: r.companyRankLabel,
      decidedEntries: r.decidedEntries,
      proposalEntries: r.proposalEntries,
    };
  });

  return Response.json({
    fy,
    totalCount: countedProjectIds.size,
    totalSales,
    departmentSummary,
    assigneeRanking,
  });
}
