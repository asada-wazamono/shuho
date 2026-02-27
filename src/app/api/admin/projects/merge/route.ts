import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: 同一案件として統合。primaryId を主レコードにし、otherIds を統合済み（参照専用）にする。
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { primaryId, otherIds } = body as { primaryId: string; otherIds: string[] };
  if (!primaryId || !Array.isArray(otherIds) || otherIds.length === 0) {
    return Response.json({ error: "primaryId と otherIds（配列）を指定してください" }, { status: 400 });
  }

  const primary = await prisma.project.findUnique({
    where: { id: primaryId },
    include: { assignees: true },
  });
  if (!primary || primary.mergedIntoId) {
    return Response.json({ error: "主案件が見つからないか、既に統合済みです" }, { status: 400 });
  }

  const group = await prisma.duplicateGroup.create({ data: {} });

  await prisma.project.update({
    where: { id: primaryId },
    data: {
      duplicateGroupId: group.id,
      isPrimaryInGroup: true,
    },
  });

  for (const id of otherIds) {
    if (id === primaryId) continue;
    const other = await prisma.project.findUnique({
      where: { id },
      include: { assignees: true },
    });
    if (!other || other.mergedIntoId) continue;

    await prisma.project.update({
      where: { id },
      data: {
        mergedIntoId: primaryId,
        duplicateGroupId: group.id,
        isPrimaryInGroup: false,
      },
    });
    // 統合元の担当者を主案件に追加（重複は @@unique でスキップ）
    for (const a of other.assignees) {
      await prisma.projectAssignee.upsert({
        where: {
          projectId_userId: { projectId: primaryId, userId: a.userId },
        },
        create: { projectId: primaryId, userId: a.userId },
        update: {},
      }).catch(() => {});
    }
  }

  return Response.json({ ok: true, primaryId, groupId: group.id });
}
