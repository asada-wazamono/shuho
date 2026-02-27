import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DAYS_ABANDONED = 7; // 最終更新から7日超で放置
const DAYS_NEAR_START = 7; // 実施開始まで7日以内

// 放置条件: 確度B/Cで最終更新7日超、または 実施開始7日以内かつ最終更新7日超
function isAbandoned(p: {
  certainty: string;
  updatedAt: Date;
  periodStart: Date | null;
}) {
  const now = new Date();
  const updatedDaysAgo = (now.getTime() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const bOrC = p.certainty === "B(50%)" || p.certainty === "C(30%)";
  if (bOrC && updatedDaysAgo > DAYS_ABANDONED) return true;
  if (!p.periodStart) return false;
  const daysToStart = (new Date(p.periodStart).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysToStart <= DAYS_NEAR_START && daysToStart >= 0 && updatedDaysAgo > DAYS_ABANDONED) return true;
  return false;
}

// GET: 放置該当案件一覧（管理者用・リマインド対象の抽出に利用）
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where: { status: { not: "good" }, mergedIntoId: null },
    include: {
      client: true,
      assignees: { include: { user: true } },
    },
  });

  const abandoned = projects.filter((p) => isAbandoned(p)).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
    certainty: p.certainty,
    updatedAt: p.updatedAt,
    periodStart: p.periodStart,
    assignees: p.assignees.map((a) => ({ email: a.user.email, name: a.user.name })),
  }));

  return Response.json(abandoned);
}
