import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVOLVEMENT_OPTIONS } from "@/lib/constants";

// POST: 子案件の新規登録
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { parentId, name, departmentBudget, businessContent, periodStart, periodEnd, note, assignees } = body;

  if (!parentId || !name) {
    return Response.json({ error: "親案件IDとプロジェクト名は必須です" }, { status: 400 });
  }
  if (departmentBudget == null || departmentBudget === "") {
    return Response.json({ error: "部門予算は必須です" }, { status: 400 });
  }

  // 親案件の存在確認 & Good確認
  const parent = await prisma.project.findUnique({
    where: { id: parentId },
    include: { assignees: { select: { userId: true } } },
  });
  if (!parent) return Response.json({ error: "親案件が見つかりません" }, { status: 404 });
  if (parent.status !== "good") {
    return Response.json({ error: "Good確定済みの案件にのみ子案件を追加できます" }, { status: 400 });
  }

  // 権限確認：管理者 OR 親案件担当者 OR 自分を担当者として含める場合
  const isAdmin = session.role === "admin";
  const isParentAssignee = parent.assignees.some((a) => a.userId === session.id);
  const isSelfIncluded = Array.isArray(assignees) &&
    assignees.some((a: { userId: string }) => a.userId === session.id);
  if (!isAdmin && !isParentAssignee && !isSelfIncluded) {
    return Response.json(
      { error: "自分を担当者として追加するか、親案件の担当者である必要があります" },
      { status: 403 }
    );
  }

  // 担当者バリデーション
  const assigneeList: { userId: string; involvement: string }[] =
    Array.isArray(assignees) ? assignees : [];
  for (const a of assigneeList) {
    if (!a.userId) return Response.json({ error: "担当者IDが必要です" }, { status: 400 });
    if (!(INVOLVEMENT_OPTIONS as readonly string[]).includes(a.involvement)) {
      return Response.json({ error: `関わり度が不正です: ${a.involvement}` }, { status: 400 });
    }
  }

  // 重複担当者チェック
  const userIds = assigneeList.map((a) => a.userId);
  if (new Set(userIds).size !== userIds.length) {
    return Response.json({ error: "同じ担当者が重複しています" }, { status: 400 });
  }

  try {
    const subProject = await prisma.subProject.create({
      data: {
        parentId,
        name: String(name).trim(),
        departmentBudget: Number(departmentBudget),
        businessContent: businessContent ? String(businessContent) : null,
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        note: note ? String(note) : null,
        status: "active",
        assignees: {
          create: assigneeList.map((a) => ({
            userId: a.userId,
            involvement: a.involvement,
            skillLevel: 2,
          })),
        },
      },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, name: true, department: true, role: true } },
          },
        },
      },
    });

    return Response.json(subProject);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "登録に失敗しました";
    if (msg.includes("Unique constraint")) {
      return Response.json({ error: "同じ担当者が重複しています" }, { status: 400 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
