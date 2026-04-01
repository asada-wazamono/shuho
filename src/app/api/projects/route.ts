import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEPARTMENTS,
  PROPOSAL_STATUS_OPTIONS,
} from "@/lib/constants";

// GET: 部員は自分が担当の案件のみ、管理者は全件
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab"); // proposal | decided | bad | all
  const clientId = searchParams.get("clientId"); // クライアント選択時の既存案件参照用
  const isAdmin = session.role === "admin";

  const where: Record<string, unknown> = { mergedIntoId: null };
  // clientId 指定時はクライアントの全案件を返す（参加検討のため絞り込み不要）
  // Bad・完了済み（Good+completed）は除外
  if (clientId) {
    where.clientId = clientId;
    where.OR = [
      { status: "undecided" },
      { status: "good", projectStatus: { not: "completed" } },
    ];
  } else {
    if (!isAdmin) {
      // 親案件担当者 OR 子案件担当者のどちらかであれば表示
      where.OR = [
        { assignees: { some: { userId: session.id } } },
        { subProjects: { some: { assignees: { some: { userId: session.id } } } } },
      ];
    }
    if (tab === "proposal") {
      where.status = "undecided";
    } else if (tab === "decided") {
      where.status = "good";
    } else if (tab === "bad") {
      where.status = "bad";
    }
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: {
        select: { id: true, name: true, department: true, note: true, createdAt: true, disabledAt: true },
      },
      assignees: {
        include: {
          user: { select: { id: true, name: true, department: true, role: true } },
        },
      },
      subProjects: {
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, department: true, role: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json(projects);
}

// POST: 新規親案件登録
// - 新規登録時は常に undecided（Good/Bad は詳細ページで設定）
// - 全体予算は必須
// - 部門予算・実施終了は子案件に移行したため非対象
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    clientId,
    name,
    projectType,
    competitorSituation,
    certainty,
    businessContent,
    ownerDepartment,
    assigneeIds,
    totalBudget,
    proposalDate,
    periodStart,
    note,
    proposalStatus,
  } = body;

  // 必須バリデーション
  if (!clientId || !name || !projectType || !businessContent || !ownerDepartment) {
    return Response.json(
      { error: "クライアント名・案件名・案件種別・業務内容・メイン担当部署は必須です" },
      { status: 400 }
    );
  }
  if (totalBudget == null || totalBudget === "") {
    return Response.json({ error: "全体予算は必須です" }, { status: 400 });
  }
  if (!DEPARTMENTS.includes(ownerDepartment)) {
    return Response.json({ error: "メイン担当部署が不正です" }, { status: 400 });
  }
  if (!proposalStatus || !(PROPOSAL_STATUS_OPTIONS as readonly string[]).includes(proposalStatus)) {
    return Response.json({ error: "提案案件ステータスは必須です" }, { status: 400 });
  }

  // 確度の自動設定
  let certaintyVal = certainty ?? "B(50%)";
  if (projectType === "自主提案") certaintyVal = "B(50%)";
  if (projectType === "AE提案") certaintyVal = "A(70%)";
  if (projectType === "競合コンペ") certaintyVal = "C(30%)";

  // 担当者の確定（ログインユーザーを必ず含む）
  const assigneesInput = Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : [];
  const assigneeSet = new Set<string>(assigneesInput);
  assigneeSet.add(session.id);
  const finalAssigneeIds = Array.from(assigneeSet);

  const existingUsers = await prisma.user.findMany({
    where: { id: { in: finalAssigneeIds } },
    select: { id: true },
  });
  if (existingUsers.length !== finalAssigneeIds.length) {
    return Response.json({ error: "担当者が見つかりません" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      clientId,
      name: String(name).trim(),
      projectType: String(projectType),
      competitorSituation: projectType === "競合コンペ" && competitorSituation
        ? String(competitorSituation)
        : null,
      certainty: certaintyVal,
      businessContent: String(businessContent),
      totalBudget: Number(totalBudget),
      proposalDate: proposalDate ? new Date(proposalDate) : null,
      periodStart: periodStart ? new Date(periodStart) : null,
      note: note ? String(note) : null,
      status: "undecided",
      proposalStatus: String(proposalStatus),
      statusUpdatedAt: new Date(),
      ownerDepartment,
      assignees: {
        create: finalAssigneeIds.map((id: string) => ({ userId: id })),
      },
    },
    include: {
      client: {
        select: { id: true, name: true, department: true, note: true, createdAt: true, disabledAt: true },
      },
      assignees: {
        include: {
          user: { select: { id: true, name: true, department: true, role: true } },
        },
      },
      subProjects: {
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, department: true, role: true } },
            },
          },
        },
      },
    },
  });

  return Response.json(project);
}
