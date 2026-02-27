import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEPARTMENTS,
  PROJECT_STATUS_OPTIONS,
  PROPOSAL_EFFORT_TYPES,
  PROPOSAL_STATUS_OPTIONS,
} from "@/lib/constants";

// GET: 部員は自分が担当の案件のみ、管理者は全件（フィルター status=proposal|decided|all）
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab"); // proposal | decided
  const isAdmin = session.role === "admin";

  const where: Record<string, unknown> = { mergedIntoId: null };
  if (!isAdmin) {
    where.assignees = { some: { userId: session.id } };
  }
  if (tab === "proposal") {
    where.status = { not: "good" }; // 未定 or Bad（提案タブ）
  } else if (tab === "decided") {
    where.status = "good";
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, department: true, note: true, createdAt: true, disabledAt: true } },
      assignees: {
        include: {
          user: { select: { id: true, name: true, department: true, role: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json(projects);
}

// POST: 新規案件（部員は自部署で担当に自分を追加、管理者も可）
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    clientId,
    name,
    projectType,
    certainty,
    businessContent,
    ownerDepartment,
    assigneeIds,
    businessLevel,
    workloadLevel,
    judgmentLevel,
    totalBudget,
    departmentBudget,
    optionalAmount,
    proposalDate,
    periodStart,
    periodEnd,
    note,
    status = "undecided",
    proposalStatus,
    projectStatus,
    proposalEffortType,
    assigneeLoadLevels,
  } = body;

  if (!clientId || !name || !projectType || !businessContent || !ownerDepartment) {
    return Response.json(
      { error: "クライアント名・案件名・案件種別・業務内容・売上責任部署は必須です" },
      { status: 400 }
    );
  }
  const totalBudgetNum = totalBudget != null ? Number(totalBudget) : null;
  const deptBudgetNum = departmentBudget != null ? Number(departmentBudget) : null;
  if (totalBudgetNum !== null && deptBudgetNum !== null && deptBudgetNum > totalBudgetNum) {
    return Response.json(
      { error: "部門予算は全体予算以下にしてください" },
      { status: 400 }
    );
  }
  if (!DEPARTMENTS.includes(ownerDepartment)) {
    return Response.json({ error: "売上責任部署が不正です" }, { status: 400 });
  }

  const assigneesInput = Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : [];
  const assigneeSet = new Set<string>(assigneesInput);
  assigneeSet.add(session.id);
  const finalAssigneeIds = Array.from(assigneeSet);
  if (finalAssigneeIds.length === 0) {
    return Response.json({ error: "担当者を1人以上選択してください" }, { status: 400 });
  }
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: finalAssigneeIds } },
    select: { id: true },
  });
  if (existingUsers.length !== finalAssigneeIds.length) {
    return Response.json({ error: "担当者が見つかりません" }, { status: 400 });
  }
  let certaintyVal = certainty ?? "B(50%)";
  if (projectType === "AE提案") certaintyVal = "A(70%)";
  if (projectType === "競合コンペ") certaintyVal = "C(30%)";
  const normalizedStatus = status === "good" ? "good" : status === "bad" ? "bad" : "undecided";
  const proposalStatusValue = proposalStatus ? String(proposalStatus) : "";
  const projectStatusValue = projectStatus ? String(projectStatus) : "";
  const proposalEffortTypeValue = proposalEffortType ? String(proposalEffortType) : "existing_continuation";
  const bl = businessLevel != null ? Number(businessLevel) : 1;
  const wl = workloadLevel != null ? Number(workloadLevel) : 1;
  const jl = judgmentLevel != null ? Number(judgmentLevel) : 1;
  if (normalizedStatus === "good") certaintyVal = "決定";

  if (normalizedStatus === "good") {
    if (!projectStatusValue || !(PROJECT_STATUS_OPTIONS as readonly string[]).includes(projectStatusValue)) {
      return Response.json({ error: "決定案件ステータスは必須です" }, { status: 400 });
    }
    if (bl < 1 || bl > 5 || wl < 1 || wl > 5 || jl < 1 || jl > 5) {
      return Response.json({ error: "決定案件では業務・稼働・判断レベルを1〜5で入力してください" }, { status: 400 });
    }
  } else {
    if (!proposalStatusValue || !(PROPOSAL_STATUS_OPTIONS as readonly string[]).includes(proposalStatusValue)) {
      return Response.json({ error: "提案案件ステータスは必須です" }, { status: 400 });
    }
    if (!(PROPOSAL_EFFORT_TYPES as readonly string[]).includes(proposalEffortTypeValue)) {
      return Response.json({ error: "提案タイプが不正です" }, { status: 400 });
    }
  }

  const project = await prisma.project.create({
    data: {
      clientId,
      name: String(name).trim(),
      projectType: String(projectType),
      certainty: certaintyVal,
      businessContent: String(businessContent),
      businessLevel: bl,
      workloadLevel: wl,
      judgmentLevel: jl,
      totalBudget: totalBudget != null ? Number(totalBudget) : null,
      departmentBudget: departmentBudget != null ? Number(departmentBudget) : null,
      optionalAmount: optionalAmount != null ? Number(optionalAmount) : null,
      proposalDate: proposalDate ? new Date(proposalDate) : null,
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      note: note ? String(note) : null,
      status: normalizedStatus,
      proposalStatus: normalizedStatus === "good" ? null : proposalStatusValue,
      proposalEffortType: normalizedStatus === "good" ? null : proposalEffortTypeValue,
      projectStatus: normalizedStatus === "good" ? projectStatusValue : null,
      statusUpdatedAt: new Date(),
      ownerDepartment,
      assignees: {
        create: finalAssigneeIds.map((id: string) => {
          const levels = assigneeLoadLevels?.[id] as
            | { businessLevel?: number; workloadLevel?: number; judgmentLevel?: number }
            | undefined;
          return {
            userId: id,
            businessLevel: levels?.businessLevel != null ? Number(levels.businessLevel) : bl,
            workloadLevel: levels?.workloadLevel != null ? Number(levels.workloadLevel) : wl,
            judgmentLevel: levels?.judgmentLevel != null ? Number(levels.judgmentLevel) : jl,
          };
        }),
      },
    },
    include: {
      client: { select: { id: true, name: true, department: true, note: true, createdAt: true, disabledAt: true } },
      assignees: {
        include: {
          user: { select: { id: true, name: true, department: true, role: true } },
        },
      },
    },
  });

  return Response.json(project);
}
