import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ department: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { assignees: true } },
    },
  });

  const withCount = users.map((u) => ({
    id: u.id,
    loginId: u.loginId,
    name: u.name,
    email: u.email,
    department: u.department,
    role: u.role,
    projectCount: u._count.assignees,
  }));

  return Response.json(withCount);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { password, name, email, department, role } = body;
  const emailVal = String(email ?? "").trim().toLowerCase();
  if (!password || !name?.trim() || !emailVal || !department) {
    return Response.json({ error: "パスワード・氏名・メール・部署は必須です" }, { status: 400 });
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email: emailVal } });
  if (existingByEmail) return Response.json({ error: "このメールアドレスは既に使用されています" }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      loginId: emailVal,
      passwordHash: hashPassword(String(password)),
      name: name.trim(),
      email: emailVal,
      department: String(department),
      role: role === "admin" ? "admin" : "staff",
    },
  });
  return Response.json({ id: user.id, email: user.email });
}
