import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVOLVEMENT_OPTIONS, SUB_PROJECT_STATUS_OPTIONS } from "@/lib/constants";

const SUB_PROJECT_INCLUDE = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, department: true, role: true } },
    },
  },
  parent: {
    select: {
      id: true, name: true, status: true, clientId: true,
      client: { select: { id: true, name: true } },
    },
  },
};

async function canEdit(subProjectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const sub = await prisma.subProject.findUnique({
    where: { id: subProjectId },
    select: {
      assignees: { select: { userId: true } },
      parent: { select: { assignees: { select: { userId: true } } } },
    },
  });
  if (!sub) return false;
  // 子案件の担当者 OR 親案件の担当者であればOK
  const isSubAssignee = sub.assignees.some((a) => a.userId === userId);
  const isParentAssignee = sub.parent.assignees.some((a) => a.userId === userId);
  return isSubAssignee || isParentAssignee;
}

// GET: 1件取得
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const subProject = await prisma.subProject.findUnique({
      where: { id },
      include: SUB_PROJECT_INCLUDE,
    });
    if (!subProject) return Response.json({ error: "Not found" }, { status: 404 });

    const ok = await canEdit(id, session.id, session.role === "admin");
    if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

    return Response.json(subProject);
  } catch (e) {
    console.error("subproject GET error:", e);
    return Response.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// PATCH: 子案件更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ok = await canEdit(id, session.id, session.role === "admin");
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const data: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.businessContent !== undefined) {
    data.businessContent = body.businessContent ? String(body.businessContent) : null;
  }
  if (body.departmentBudget !== undefined) {
    data.departmentBudget = body.departmentBudget == null ? null : Number(body.departmentBudget);
  }
  if (body.periodStart !== undefined) {
    data.periodStart = body.periodStart ? new Date(body.periodStart) : null;
  }
  if (body.periodEnd !== undefined) {
    data.periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
  }
  if (body.status !== undefined) {
    if (!(SUB_PROJECT_STATUS_OPTIONS as readonly string[]).includes(body.status)) {
      return Response.json({ error: "ステータスが不正です" }, { status: 400 });
    }
    data.status = body.status;
  }

  // 担当者の差分更新
  if (body.assignees !== undefined) {
    const assigneeList: { userId: string; involvement: string }[] =
      Array.isArray(body.assignees) ? body.assignees : [];

    for (const a of assigneeList) {
      if (!(INVOLVEMENT_OPTIONS as readonly string[]).includes(a.involvement)) {
        return Response.json({ error: `関わり度が不正です: ${a.involvement}` }, { status: 400 });
      }
    }

    // 重複チェック
    const userIds = assigneeList.map((a) => a.userId);
    if (new Set(userIds).size !== userIds.length) {
      return Response.json({ error: "同じ担当者が重複しています" }, { status: 400 });
    }
  }

  try {
    // 担当者を削除して再作成
    if (body.assignees !== undefined) {
      const assigneeList: { userId: string; involvement: string }[] =
        Array.isArray(body.assignees) ? body.assignees : [];
      await prisma.subProjectAssignee.deleteMany({ where: { subProjectId: id } });
      if (assigneeList.length > 0) {
        await prisma.subProjectAssignee.createMany({
          data: assigneeList.map((a) => ({
            subProjectId: id,
            userId: a.userId,
            involvement: a.involvement,
            skillLevel: 2,
          })),
        });
      }
    }

    const subProject = await prisma.subProject.update({
      where: { id },
      data: data as never,
      include: SUB_PROJECT_INCLUDE,
    });
    return Response.json(subProject);
  } catch (e) {
    console.error("subproject PATCH error:", e);
    const msg = e instanceof Error ? e.message : "更新に失敗しました";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 子案件削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ok = await canEdit(id, session.id, session.role === "admin");
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.subProject.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("subproject DELETE error:", e);
    return Response.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
