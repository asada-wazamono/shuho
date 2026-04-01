import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const logs = await prisma.aiQueryLog.findMany({
    where: { userId: session.id, answer: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, question: true, answer: true, mode: true, createdAt: true },
  });

  return Response.json(logs);
}
