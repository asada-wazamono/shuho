import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const REMINDER_DAYS = 7; // 提案日から何日後からリマインド対象にするか

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const threshold = new Date(now.getTime() - REMINDER_DAYS * 24 * 60 * 60 * 1000);

  // 提案日から7日以上経過 かつ proposalStatus が "preparing" のまま の案件
  // かつ自分が担当している
  const projects = await prisma.project.findMany({
    where: {
      status: "undecided",
      proposalStatus: "preparing",
      proposalDate: { lte: threshold },
      mergedIntoId: null,
      assignees: { some: { userId: session.id } },
    },
    include: {
      client: { select: { name: true } },
    },
    orderBy: { proposalDate: "asc" },
  });

  const result = projects.map((p) => {
    const daysElapsed = Math.floor(
      (now.getTime() - new Date(p.proposalDate!).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      id: p.id,
      name: p.name,
      clientName: p.client.name,
      projectType: p.projectType,
      proposalDate: p.proposalDate,
      proposalStatus: p.proposalStatus,
      daysElapsed,
    };
  });

  return NextResponse.json(result);
}

// ステータス更新
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { projectId, proposalStatus } = body;
  if (!projectId || !proposalStatus) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  // 自分が担当者かチェック
  const assignee = await prisma.projectAssignee.findFirst({
    where: { projectId, userId: session.id },
  });
  if (!assignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.project.update({
    where: { id: projectId },
    data: { proposalStatus },
  });

  return NextResponse.json({ ok: true });
}
