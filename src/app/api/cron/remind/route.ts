import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReminder } from "@/lib/remind";

const DAYS_ABANDONED = 7;
const DAYS_NEAR_START = 7;

function isAbandoned(p: { certainty: string; updatedAt: Date; periodStart: Date | null }) {
  const now = new Date();
  const updatedDaysAgo = (now.getTime() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const bOrC = p.certainty === "B(50%)" || p.certainty === "C(30%)";
  if (bOrC && updatedDaysAgo > DAYS_ABANDONED) return true;
  if (!p.periodStart) return false;
  const daysToStart = (new Date(p.periodStart).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysToStart <= DAYS_NEAR_START && daysToStart >= 0 && updatedDaysAgo > DAYS_ABANDONED;
}

// GET: リマインド送信（cron や手動で呼び出す。本人のみにメール送信）
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { status: { not: "good" }, mergedIntoId: null },
    include: { client: true, assignees: { include: { user: true } } },
  });

  const abandoned = projects.filter((p) => isAbandoned(p));
  let sent = 0;
  for (const p of abandoned) {
    const subject = `【週報】放置案件のリマインド: ${p.name}`;
    const text = `以下の案件が一定期間更新されていません。\n\n案件名: ${p.name}\nクライアント: ${p.client.name}\n最終更新: ${p.updatedAt.toLocaleDateString("ja")}\n実施予定開始: ${p.periodStart?.toLocaleDateString("ja") ?? "未設定"}\n\nシステムにログインして更新してください。`;
    for (const a of p.assignees) {
      if (a.user.email) {
        const ok = await sendReminder(a.user.email, subject, text);
        if (ok) sent++;
      }
    }
  }

  return Response.json({ ok: true, abandonedCount: abandoned.length, emailsSent: sent });
}
