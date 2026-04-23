import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type FieldChoice = "source" | "target";
type MergeChoices = {
  totalBudget?: FieldChoice;
  ownerDepartment?: FieldChoice;
  businessContent?: FieldChoice;
  projectType?: FieldChoice;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { intoId, choices = {} } = body as { intoId: string; choices?: MergeChoices };

  if (!intoId || intoId === id) {
    return Response.json({ error: "統合先のIDが不正です" }, { status: 400 });
  }

  // 吸収側を取得
  const absorbed = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, status: true, clientId: true, mergedIntoId: true, name: true,
      totalBudget: true, ownerDepartment: true, businessContent: true, projectType: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!absorbed) return Response.json({ error: "案件が見つかりません" }, { status: 404 });
  if (absorbed.mergedIntoId) return Response.json({ error: "この案件は既に統合済みです" }, { status: 400 });
  if (absorbed.status !== "undecided" && absorbed.status !== "good") {
    return Response.json({ error: "提案案件または決定案件のみ統合できます" }, { status: 400 });
  }

  // 存続側を取得
  const surviving = await prisma.project.findUnique({
    where: { id: intoId },
    select: {
      id: true, status: true, clientId: true, mergedIntoId: true, name: true,
      totalBudget: true, ownerDepartment: true, businessContent: true, projectType: true,
    },
  });
  if (!surviving) return Response.json({ error: "統合先の案件が見つかりません" }, { status: 404 });
  if (surviving.mergedIntoId) return Response.json({ error: "統合先の案件は既に統合済みです" }, { status: 400 });
  if (absorbed.status !== surviving.status) {
    return Response.json({ error: "同じステータスの案件同士のみ統合できます" }, { status: 400 });
  }

  // クライアントチェック
  if (absorbed.clientId !== surviving.clientId) {
    return Response.json({ error: "同じクライアントの案件のみ統合できます" }, { status: 400 });
  }

  // 子案件を存続側に付け替え
  await prisma.subProject.updateMany({
    where: { parentId: id },
    data: { parentId: intoId },
  });

  // 決定案件の場合: フィールド選択を適用 + 担当者マージ
  if (absorbed.status === "good") {
    const updateData: Record<string, unknown> = {};
    if (choices.totalBudget === "source") updateData.totalBudget = absorbed.totalBudget;
    if (choices.ownerDepartment === "source") updateData.ownerDepartment = absorbed.ownerDepartment;
    if (choices.businessContent === "source") updateData.businessContent = absorbed.businessContent;
    if (choices.projectType === "source") updateData.projectType = absorbed.projectType;

    if (Object.keys(updateData).length > 0) {
      await prisma.project.update({ where: { id: intoId }, data: updateData });
    }

    // 担当者を自動マージ
    for (const a of absorbed.assignees) {
      await prisma.projectAssignee.upsert({
        where: { projectId_userId: { projectId: intoId, userId: a.userId } },
        create: { projectId: intoId, userId: a.userId },
        update: {},
      }).catch(() => {});
    }
  }

  // 吸収側に mergedIntoId をセット
  await prisma.project.update({
    where: { id },
    data: { mergedIntoId: intoId },
  });

  return Response.json({ ok: true, absorbedId: id, survivingId: intoId });
}

// DELETE: 統合解除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params; // id = 吸収された側（解除したい）案件のID

  const absorbed = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, mergedIntoId: true },
  });
  if (!absorbed || !absorbed.mergedIntoId) {
    return Response.json({ error: "この案件は統合されていません" }, { status: 400 });
  }

  // 名前が一致する子案件を元の親に戻す（ベストエフォート）
  await prisma.subProject.updateMany({
    where: { parentId: absorbed.mergedIntoId, name: absorbed.name },
    data: { parentId: id },
  });

  // mergedIntoId をクリアして元の案件として復帰
  await prisma.project.update({
    where: { id },
    data: { mergedIntoId: null },
  });

  return Response.json({ ok: true });
}
