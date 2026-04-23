import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 決定案件（子案件ごとに1行）
  const decidedProjects = await prisma.project.findMany({
    where: { status: "good", mergedIntoId: null },
    select: {
      name: true,
      ownerDepartment: true,
      totalBudget: true,
      client: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } },
      subProjects: {
        select: {
          name: true,
          departmentBudget: true,
          periodStart: true,
          periodEnd: true,
          assignees: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { ownerDepartment: "asc" },
  });

  // 提案案件（1案件1行）
  const proposalProjects = await prisma.project.findMany({
    where: { status: "undecided", mergedIntoId: null },
    select: {
      name: true,
      ownerDepartment: true,
      totalBudget: true,
      periodStart: true,
      client: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } },
    },
    orderBy: { ownerDepartment: "asc" },
  });

  const rows: Record<string, string | number | null>[] = [];

  // 決定案件の行を生成
  for (const p of decidedProjects) {
    const parentAssignees = p.assignees.map((a) => a.user.name).join("、");
    if (p.subProjects.length === 0) {
      rows.push({
        種別: "決定",
        担当部署: p.ownerDepartment,
        クライアント: p.client.name,
        案件名: p.name,
        子案件名: "",
        全体予算: p.totalBudget ?? "",
        部門予算: "",
        実施開始: "",
        実施終了: "",
        担当者: parentAssignees,
      });
    } else {
      for (const sp of p.subProjects) {
        const spAssignees = sp.assignees.map((a) => a.user.name).join("、");
        rows.push({
          種別: "決定",
          担当部署: p.ownerDepartment,
          クライアント: p.client.name,
          案件名: p.name,
          子案件名: sp.name,
          全体予算: p.totalBudget ?? "",
          部門予算: sp.departmentBudget ?? "",
          実施開始: sp.periodStart ? sp.periodStart.toISOString().slice(0, 10) : "",
          実施終了: sp.periodEnd ? sp.periodEnd.toISOString().slice(0, 10) : "",
          担当者: spAssignees || parentAssignees,
        });
      }
    }
  }

  // 提案案件の行を生成
  for (const p of proposalProjects) {
    rows.push({
      種別: "提案",
      担当部署: p.ownerDepartment,
      クライアント: p.client.name,
      案件名: p.name,
      子案件名: "",
      全体予算: p.totalBudget ?? "",
      部門予算: "",
      実施開始: p.periodStart ? p.periodStart.toISOString().slice(0, 10) : "",
      実施終了: "",
      担当者: p.assignees.map((a) => a.user.name).join("、"),
    });
  }

  return NextResponse.json(rows);
}
