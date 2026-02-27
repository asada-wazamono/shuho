import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return Response.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  if (user.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return Response.json({ error: "管理者が1人だけのため削除できません" }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
