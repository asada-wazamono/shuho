import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const logs = await prisma.aiQueryLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(logs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ログの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
