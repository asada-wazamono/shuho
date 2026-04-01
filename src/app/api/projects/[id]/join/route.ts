import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: 既存案件への参加（担当者として追加）
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id, mergedIntoId: null },
    select: { id: true, status: true },
  });
  if (!project) return Response.json({ error: "案件が見つかりません" }, { status: 404 });
  if (project.status === "bad") {
    return Response.json({ error: "Bad案件には参加できません" }, { status: 400 });
  }

  // 既に担当者の場合はスキップ（冪等）
  const existing = await prisma.projectAssignee.findFirst({
    where: { projectId: id, userId: session.id },
  });
  if (existing) {
    return Response.json({ ok: true, message: "既に担当者として登録されています" });
  }

  await prisma.projectAssignee.create({
    data: { projectId: id, userId: session.id },
  });

  return Response.json({ ok: true });
}
