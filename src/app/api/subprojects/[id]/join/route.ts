import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVOLVEMENT_OPTIONS } from "@/lib/constants";

// POST: 子案件に担当者として参加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const subProject = await prisma.subProject.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!subProject) return Response.json({ error: "子案件が見つかりません" }, { status: 404 });

  // 既に参加済みの場合は冪等に返す
  const existing = await prisma.subProjectAssignee.findFirst({
    where: { subProjectId: id, userId: session.id },
  });
  if (existing) {
    return Response.json({ ok: true, message: "既に参加しています" });
  }

  const body = await request.json().catch(() => ({}));
  const involvement = (body.involvement as string) ?? "SUB";

  if (!(INVOLVEMENT_OPTIONS as readonly string[]).includes(involvement)) {
    return Response.json({ error: `関わり度が不正です: ${involvement}` }, { status: 400 });
  }

  await prisma.subProjectAssignee.create({
    data: {
      subProjectId: id,
      userId: session.id,
      involvement,
      skillLevel: 2,
    },
  });

  return Response.json({ ok: true });
}
