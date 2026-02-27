import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const password = body.password;
  if (!password || String(password).length < 4) {
    return Response.json({ error: "パスワードは4文字以上で指定してください" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(String(password)) },
  });
  return Response.json({ ok: true });
}
