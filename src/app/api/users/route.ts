import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 担当者選択用のユーザー一覧（ログイン済みなら取得可）
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, department: true, role: true },
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });

  return Response.json(users);
}
