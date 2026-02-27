import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEPARTMENTS,
  PROJECT_STATUS_OPTIONS,
  PROPOSAL_EFFORT_TYPES,
  PROPOSAL_STATUS_OPTIONS,
} from "@/lib/constants";

async function canEditProject(projectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const a = await prisma.projectAssignee.findFirst({
    where: { projectId, userId },
  });
  return !!a;
}

// GET: 1件取得
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id, mergedIntoId: null },
    include: {
      client: { select: { id: true, name: true, department: true, note: true, createdAt: true, disabledAt: true } },
      assignees: {
        include: {
          user: { select: { id: true, name: true, department: true, role: true } },
        },
      },
    },
  });
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.role === "admin";
  const canEdit = isAdmin || project.assignees.some((a) => a.userId === session.id);
  if (!canEdit) return Response.json({ error: "Forbidden" }, { status: 403 });

  return Response.json(project);
}

// PATCH: 更新（Good/Bad/確度/レベル/予算/期間/備考など）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const canEdit = await canEditProject(id, session.id, session.role === "admin");
  if (!canEdit) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.project.findUnique({
    where: { id },
  });
  if (!existing || existing.mergedIntoId) {
    return Response.json({ error: "統合済み案件は編集できません" }, { status: 400 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = { updatedAt: new Date() };
  let shouldUpdateStatusUpdatedAt = false;

  // --- 予算バリデーション ---
  const totalBudget = body.totalBudget !== undefined ? body.totalBudget : existing.totalBudget;
  const departmentBudget = body.departmentBudget !== undefined ? body.departmentBudget : existing.departmentBudget;
  const totalBudgetNum = totalBudget != null ? Number(totalBudget) : null;
  const deptBudgetNum = departmentBudget != null ? Number(departmentBudget) : null;
  if (totalBudgetNum !== null && deptBudgetNum !== null && deptBudgetNum > totalBudgetNum) {
    return Response.json(
      { error: "部門予算は全体予算以下にしてください" },
      { status: 400 }
    );
  }

  const strFields = [
    "name",
    "projectType",
    "certainty",
    "businessContent",
    "status",
    "note",
    "proposalStatus",
    "projectStatus",
    "proposalEffortType",
  ];
  for (const key of strFields) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.ownerDepartment !== undefined) {
    if (!DEPARTMENTS.includes(body.ownerDepartment)) {
      return Response.json({ error: "売上責任部署が不正です" }, { status: 400 });
    }
    data.ownerDepartment = body.ownerDepartment;
  }

  // --- 担当者の差分更新（負荷値を保持） ---
  const assigneeLoadLevels: Record<string, { businessLevel?: number; workloadLevel?: number; judgmentLevel?: number }> =
    body.assigneeLoadLevels ?? {};

  if (body.assigneeIds !== undefined) {
    const input = Array.isArray(body.assigneeIds) ? body.assigneeIds.filter(Boolean) : [];
    const assigneeSet = new Set<string>(input);
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

    const existingAssignees = await prisma.projectAssignee.findMany({
      where: { projectId: id },
    });
    const existingMap = new Map(existingAssignees.map((a) => [a.userId, a]));

    // 削除された担当者を除去
    const removedIds = existingAssignees
      .filter((a) => !finalAssigneeIds.includes(a.userId))
      .map((a) => a.userId);
    if (removedIds.length > 0) {
      await prisma.projectAssignee.deleteMany({
        where: { projectId: id, userId: { in: removedIds } },
      });
    }

    // デフォルト負荷値（Projectレベル）
    const defaultBl = body.businessLevel !== undefined ? Number(body.businessLevel) : existing.businessLevel;
    const defaultWl = body.workloadLevel !== undefined ? Number(body.workloadLevel) : existing.workloadLevel;
    const defaultJl = body.judgmentLevel !== undefined ? Number(body.judgmentLevel) : existing.judgmentLevel;

    for (const userId of finalAssigneeIds) {
      const prev = existingMap.get(userId);
      const explicit = assigneeLoadLevels[userId];
      if (prev) {
        // 既存担当者: 明示的に値が送られた場合のみ更新
        if (explicit) {
          await prisma.projectAssignee.update({
            where: { id: prev.id },
            data: {
              businessLevel: Number(explicit.businessLevel ?? prev.businessLevel),
              workloadLevel: Number(explicit.workloadLevel ?? prev.workloadLevel),
              judgmentLevel: Number(explicit.judgmentLevel ?? prev.judgmentLevel),
            },
          });
        }
      } else {
        // 新規担当者: 明示値 or Projectデフォルト
        await prisma.projectAssignee.create({
          data: {
            projectId: id,
            userId,
            businessLevel: explicit?.businessLevel != null ? Number(explicit.businessLevel) : defaultBl,
            workloadLevel: explicit?.workloadLevel != null ? Number(explicit.workloadLevel) : defaultWl,
            judgmentLevel: explicit?.judgmentLevel != null ? Number(explicit.judgmentLevel) : defaultJl,
          },
        });
      }
    }
  } else if (Object.keys(assigneeLoadLevels).length > 0) {
    // 担当者変更なし・負荷のみ更新
    for (const [userId, levels] of Object.entries(assigneeLoadLevels)) {
      await prisma.projectAssignee.updateMany({
        where: { projectId: id, userId },
        data: {
          ...(levels.businessLevel != null && { businessLevel: Number(levels.businessLevel) }),
          ...(levels.workloadLevel != null && { workloadLevel: Number(levels.workloadLevel) }),
          ...(levels.judgmentLevel != null && { judgmentLevel: Number(levels.judgmentLevel) }),
        },
      });
    }
  }
  const numFields = ["businessLevel", "workloadLevel", "judgmentLevel", "totalBudget", "departmentBudget", "optionalAmount"];
  for (const key of numFields) {
    if (body[key] !== undefined) data[key] = body[key] == null ? null : Number(body[key]);
  }
  const dateFields = ["proposalDate", "periodStart", "periodEnd"];
  for (const key of dateFields) {
    if (body[key] !== undefined) data[key] = body[key] ? new Date(body[key]) : null;
  }
  if (body.status === "good" && body.certainty === undefined) {
    data.certainty = "決定";
  }

  const nextStatus =
    body.status !== undefined
      ? body.status === "good"
        ? "good"
        : body.status === "bad"
          ? "bad"
          : "undecided"
      : existing.status;
  data.status = nextStatus;

  const nextProposalStatus =
    body.proposalStatus !== undefined ? String(body.proposalStatus || "") : existing.proposalStatus;
  const nextProjectStatus =
    body.projectStatus !== undefined
      ? String(body.projectStatus || "")
      : (existing.projectStatus ?? (nextStatus === "good" ? "in_progress" : ""));
  const nextProposalEffortType =
    body.proposalEffortType !== undefined
      ? String(body.proposalEffortType || "")
      : (existing.proposalEffortType ?? "existing_continuation");
  const nextBusinessLevel =
    body.businessLevel !== undefined ? Number(body.businessLevel) : existing.businessLevel;
  const nextWorkloadLevel =
    body.workloadLevel !== undefined ? Number(body.workloadLevel) : existing.workloadLevel;
  const nextJudgmentLevel =
    body.judgmentLevel !== undefined ? Number(body.judgmentLevel) : existing.judgmentLevel;

  if (nextStatus === "good") {
    if (!nextProjectStatus || !(PROJECT_STATUS_OPTIONS as readonly string[]).includes(nextProjectStatus)) {
      return Response.json({ error: "決定案件ステータスは必須です" }, { status: 400 });
    }
    if (
      nextBusinessLevel < 1 || nextBusinessLevel > 5 ||
      nextWorkloadLevel < 1 || nextWorkloadLevel > 5 ||
      nextJudgmentLevel < 1 || nextJudgmentLevel > 5
    ) {
      return Response.json({ error: "決定案件では業務・稼働・判断レベルを1〜5で入力してください" }, { status: 400 });
    }
    data.projectStatus = nextProjectStatus;
    data.proposalStatus = null;
    data.proposalEffortType = null;
  } else if (nextStatus === "bad") {
    // 失注：proposalEffortType は履歴として保持、進行中ステータスのみクリア
    data.proposalStatus = null;
    data.projectStatus = null;
  } else {
    // undecided（提案中）
    if (!nextProposalStatus || !(PROPOSAL_STATUS_OPTIONS as readonly string[]).includes(nextProposalStatus)) {
      return Response.json({ error: "提案案件ステータスは必須です" }, { status: 400 });
    }
    if (!(PROPOSAL_EFFORT_TYPES as readonly string[]).includes(nextProposalEffortType)) {
      return Response.json({ error: "提案タイプが不正です" }, { status: 400 });
    }
    data.proposalStatus = nextProposalStatus;
    data.projectStatus = null;
    data.proposalEffortType = nextProposalEffortType;
  }

  if (nextStatus !== existing.status) {
    shouldUpdateStatusUpdatedAt = true;
  }
  if (nextProposalStatus !== existing.proposalStatus) {
    shouldUpdateStatusUpdatedAt = true;
  }
  if (nextProjectStatus !== existing.projectStatus) {
    shouldUpdateStatusUpdatedAt = true;
  }
  if (nextProposalEffortType !== (existing.proposalEffortType ?? "existing_continuation")) {
    shouldUpdateStatusUpdatedAt = true;
  }
  if (shouldUpdateStatusUpdatedAt) {
    data.statusUpdatedAt = new Date();
  }

  const project = await prisma.project.update({
    where: { id },
    data: data as never,
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

// DELETE: 案件削除（担当者 or 管理者）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const canEdit = await canEditProject(id, session.id, session.role === "admin");
  if (!canEdit) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id } });
  return Response.json({ ok: true });
}
