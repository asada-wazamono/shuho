import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: クライアント一覧（ログイン済みなら誰でも選択肢用に取得可）
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await prisma.client.findMany({
    where: { disabledAt: null },
    orderBy: { name: "asc" },
  });
  return Response.json(clients);
}

// POST: 新規クライアント（ログイン済みなら誰でも）
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, department, note, clientCode } = body;
  if (!name || !String(name).trim()) {
    return Response.json({ error: "クライアント名は必須です" }, { status: 400 });
  }
  if (!clientCode || !String(clientCode).trim()) {
    return Response.json({ error: "クライアントコードは必須です" }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { clientCode: String(clientCode).trim() } });
  if (existing) {
    return Response.json({ error: "このクライアントコードはすでに使用されています" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      clientCode: String(clientCode).trim(),
      name: String(name).trim(),
      department: department ? String(department) : null,
      note: note ? String(note) : null,
    },
  });
  return Response.json(client);
}
