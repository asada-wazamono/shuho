import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEPARTMENTS,
  EXECUTION_STATUS_OPTIONS,
  PROPOSAL_STATUS_OPTIONS,
} from "@/lib/constants";

async function canEditProject(projectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const a = await prisma.projectAssignee.findFirst({ where: { projectId, userId } });
  return !!a;
}

const PROJECT_INCLUDE = {
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
    orderBy: { createdAt: "asc" as const },
  },
  mergedProjects: {
    select: { id: true, name: true, status: true },
  },
};

// GET: 1件取得（subProjects含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id, mergedIntoId: null },
    include: PROJECT_INCLUDE,
  });
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.role === "admin";
  const isParentAssignee = project.assignees.some((a) => a.userId === session.id);
  const isSubAssignee = project.subProjects.some((sp) =>
    sp.assignees.some((a) => a.userId === session.id)
  );
  const canAccess = isAdmin || isParentAssignee || isSubAssignee;
  if (!canAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  // 提案日経過チェック：undecided + proposalDate < 今日 + proposalStatus が preparing の場合のみ自動更新しない
  // （バッチ処理で行うため、ここでは返却のみ）
  return Response.json(project);
}

// PATCH: 更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const canEdit = await canEditProject(id, session.id, session.role === "admin");
  if (!canEdit) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing || existing.mergedIntoId) {
    return Response.json({ error: "統合済み案件は編集できません" }, { status: 400 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = { updatedAt: new Date() };
  let shouldUpdateStatusUpdatedAt = false;

  // 文字列フィールド
  const strFields = [
    "name", "projectType", "competitorSituation",
    "certainty", "businessContent", "note",
  ];
  for (const key of strFields) {
    if (body[key] !== undefined) data[key] = body[key] ?? null;
  }

  // メイン担当部署
  if (body.ownerDepartment !== undefined) {
    if (!DEPARTMENTS.includes(body.ownerDepartment)) {
      return Response.json({ error: "メイン担当部署が不正です" }, { status: 400 });
    }
    data.ownerDepartment = body.ownerDepartment;
  }

  // 数値フィールド
  const numFields = ["totalBudget", "optionalAmount"];
  for (const key of numFields) {
    if (body[key] !== undefined) data[key] = body[key] == null ? null : Number(body[key]);
  }

  // 日付フィールド
  const dateFields = ["proposalDate", "periodStart"];
  for (const key of dateFields) {
    if (body[key] !== undefined) data[key] = body[key] ? new Date(body[key]) : null;
  }

  // 担当者の差分更新（assignees: [{userId,involvement}] or assigneeIds: string[] をサポート）
  if (body.assignees !== undefined || body.assigneeIds !== undefined) {
    const involvementMap = new Map<string, string>();
    if (body.assignees !== undefined) {
      const arr = Array.isArray(body.assignees) ? body.assignees : [];
      for (const a of arr as { userId: string; involvement?: string }[]) {
        if (a.userId) involvementMap.set(a.userId, a.involvement || "SUB");
      }
    } else {
      const input = Array.isArray(body.assigneeIds) ? body.assigneeIds.filter(Boolean) : [];
      for (const uid of input as string[]) involvementMap.set(uid, "SUB");
    }
    if (!involvementMap.has(session.id)) involvementMap.set(session.id, "SUB");
    const finalAssigneeIds = Array.from(involvementMap.keys());
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
    const existingUserIds = existingAssignees.map((a) => a.userId);
    const removedIds = existingUserIds.filter((uid) => !finalAssigneeIds.includes(uid));
    if (removedIds.length > 0) {
      await prisma.projectAssignee.deleteMany({
        where: { projectId: id, userId: { in: removedIds } },
      });
    }
    for (const userId of finalAssigneeIds) {
      const involvement = involvementMap.get(userId) ?? "SUB";
      if (existingUserIds.includes(userId)) {
        // 既存レコードの involvement を更新
        await prisma.projectAssignee.updateMany({
          where: { projectId: id, userId },
          data: { involvement },
        });
      } else {
        await prisma.projectAssignee.create({ data: { projectId: id, userId, involvement } });
      }
    }
  }

  // 親案件の実行ステータスを「完了」にする場合、全子案件が完了済みかチェック
  if (body.projectStatus === "completed") {
    const incompleteSubs = await prisma.subProject.count({
      where: { parentId: id, status: { not: "completed" } },
    });
    if (incompleteSubs > 0) {
      return Response.json(
        { error: `完了にできません。未完了の子案件が${incompleteSubs}件あります。先に子案件を全て完了にしてください。` },
        { status: 400 }
      );
    }
  }

  // ── ステータス遷移ロジック ─────────────────────────────────
  const nextStatus =
    body.status !== undefined
      ? body.status === "good" ? "good" : body.status === "bad" ? "bad" : "undecided"
      : existing.status;
  data.status = nextStatus;

  if (nextStatus === "good") {
    // Good確定
    data.certainty = "決定";
    data.proposalStatus = null;
    // projectStatus（実行フェーズ）を設定
    const execStatus = body.projectStatus ?? existing.projectStatus ?? "active";
    if (!(EXECUTION_STATUS_OPTIONS as readonly string[]).includes(execStatus)) {
      return Response.json({ error: "実行ステータスが不正です" }, { status: 400 });
    }
    data.projectStatus = execStatus;

  } else if (nextStatus === "bad") {
    // Bad確定：理由は必須
    if (body.badReason !== undefined) {
      if (!body.badReason || String(body.badReason).trim() === "") {
        return Response.json({ error: "Badの理由を入力してください" }, { status: 400 });
      }
      data.badReason = String(body.badReason).trim();
    } else if (existing.status !== "bad" && !existing.badReason) {
      // bad に変更するのに badReason がない場合
      return Response.json({ error: "Badの理由を入力してください" }, { status: 400 });
    }
    data.proposalStatus = null;
    data.projectStatus = null;

  } else {
    // undecided（提案中）
    if (body.proposalStatus !== undefined) {
      const ps = String(body.proposalStatus || "");
      if (ps && !(PROPOSAL_STATUS_OPTIONS as readonly string[]).includes(ps)) {
        return Response.json({ error: "提案案件ステータスが不正です" }, { status: 400 });
      }
      data.proposalStatus = ps || null;
    }
    // undecided のときに projectStatus が送られてきた場合は受け付けない
    data.projectStatus = null;
  }

  // projectStatus のみ更新（Good確定済みの案件で実行フェーズを変更する場合）
  if (nextStatus === "good" && body.projectStatus !== undefined) {
    const execStatus = String(body.projectStatus || "");
    if (execStatus && !(EXECUTION_STATUS_OPTIONS as readonly string[]).includes(execStatus)) {
      return Response.json({ error: "実行ステータスが不正です" }, { status: 400 });
    }
    data.projectStatus = execStatus || null;
  }

  // statusUpdatedAt の更新判定
  if (nextStatus !== existing.status) shouldUpdateStatusUpdatedAt = true;
  if (body.proposalStatus !== undefined && body.proposalStatus !== existing.proposalStatus) {
    shouldUpdateStatusUpdatedAt = true;
    (data as Record<string, unknown>).proposalStatusUpdatedAt = new Date(); // 提案ステータス専用の更新日
  }
  if (body.projectStatus !== undefined && body.projectStatus !== existing.projectStatus) {
    shouldUpdateStatusUpdatedAt = true;
  }
  if (shouldUpdateStatusUpdatedAt) data.statusUpdatedAt = new Date();

  // 競合コンペ以外の場合は competitorSituation をクリア
  const finalProjectType = data.projectType ?? existing.projectType;
  if (finalProjectType !== "競合コンペ") {
    data.competitorSituation = null;
  }

  const project = await prisma.project.update({
    where: { id },
    data: data as never,
    include: PROJECT_INCLUDE,
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
