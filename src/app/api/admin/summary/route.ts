import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcSubProjectLoads } from "@/lib/loadScore";
import { DEPARTMENTS, getLoadLabel, type Involvement } from "@/lib/constants";

type Contributor = {
  subProjectId: string;
  subProjectName: string;
  parentProjectName: string;
  involvement: string;
  skillLevel: number;
  contribution: number;
};

type UserAggregate = {
  userId: string;
  name: string;
  department: string;
  totalLoad: number;
  subProjectCount: number;
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

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 全ユーザー（staff）を取得
  const users = await prisma.user.findMany({
    where: { role: "staff" },
    select: { id: true, name: true, department: true },
  });

  // 全subProject（進行中のもの）を一括取得
  const subProjects = await prisma.subProject.findMany({
    where: {
      status: "active", // 完了を除外
      parent: { status: "good", mergedIntoId: null },
    },
    include: {
      parent: { select: { id: true, name: true, ownerDepartment: true, departmentBudget: true, optionalAmount: true } },
      assignees: { include: { user: { select: { id: true, name: true, department: true } } } },
    },
  });

  // 担当者別の集計マップを初期化
  const userAgg: Record<string, UserAggregate> = {};
  for (const u of users) {
    userAgg[u.id] = {
      userId: u.id, name: u.name, department: u.department,
      totalLoad: 0, subProjectCount: 0, contributors: [],
    };
  }

  // 部署別 売上集計（SubProjectのdepartmentBudget のみ）
  // 親案件1件につき子案件の部門予算の合計を売上として集計
  const byDept: Record<string, { sales: number; count: number }> = {};
  for (const d of DEPARTMENTS) byDept[d] = { sales: 0, count: 0 };

  // 親案件ごとに子案件の部門予算を合算（重複カウント防止）
  const goodProjects = await prisma.project.findMany({
    where: { status: "good", mergedIntoId: null },
    include: {
      subProjects: { select: { departmentBudget: true } },
      duplicateGroup: { include: { projects: { select: { id: true, isPrimaryInGroup: true } } } },
    },
  });

  for (const p of goodProjects) {
    // 重複グループがある場合は主案件のみ集計
    if (p.duplicateGroupId && !p.isPrimaryInGroup) continue;
    const dept = p.ownerDepartment;
    // 子案件がある場合は子案件の部門予算合計、ない場合は親の部門予算（移行データ）
    const subBudget = p.subProjects.length > 0
      ? p.subProjects.reduce((s, sp) => s + (sp.departmentBudget ?? 0), 0)
      : (p.departmentBudget ?? 0);
    const sales = subBudget;
    if (byDept[dept]) {
      byDept[dept].sales += sales;
      byDept[dept].count += 1;
    }
  }

  // 担当者別 負荷集計（チーム構成按分方式）
  for (const sp of subProjects) {
    const loads = calcSubProjectLoads(
      sp.assignees.map((a) => ({ userId: a.userId, involvement: a.involvement as Involvement }))
    );
    for (const a of sp.assignees) {
      const target = userAgg[a.userId];
      if (!target) continue;
      const score = loads[a.userId] ?? 0;
      target.totalLoad += score;
      target.subProjectCount += 1;
      target.contributors.push({
        subProjectId: sp.id,
        subProjectName: sp.name,
        parentProjectName: sp.parent.name,
        involvement: a.involvement,
        skillLevel: a.skillLevel,
        contribution: score,
      });
    }
  }

  const totalSales = Object.values(byDept).reduce((s, d) => s + d.sales, 0);

  // baseRows 生成
  const baseRows = users
    .map((u) => {
      const agg = userAgg[u.id];
      return {
        userId: u.id,
        name: u.name,
        department: u.department,
        totalLoad: agg.totalLoad,
        subProjectCount: agg.subProjectCount,
        absoluteLabel: getLoadLabel(agg.totalLoad),
        topContributors: agg.contributors
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3),
        score: agg.totalLoad,
      };
    })
    .sort((a, b) => b.totalLoad - a.totalLoad);

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

  const assigneeRanking = rowsWithCompany.map((r) => ({
    userId: r.userId,
    name: r.name,
    department: r.department,
    totalLoad: r.totalLoad,
    absoluteLabel: r.absoluteLabel,
    subProjectCount: r.subProjectCount,
    deptRank: deptRankMap.get(r.userId)?.rank ?? 0,
    deptRankLabel: deptRankMap.get(r.userId)?.label ?? "標準",
    companyRank: r.companyRank,
    companyRankLabel: r.companyRankLabel,
    topContributors: r.topContributors,
  }));

  return Response.json({
    totalCount: goodProjects.length,
    totalSales,
    departmentSummary,
    assigneeRanking,
  });
}
