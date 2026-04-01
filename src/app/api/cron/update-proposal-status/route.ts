import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * バッチ処理：提案日経過後のステータス自動更新
 * - 毎朝3時に Vercel Cron から呼び出される（vercel.json 参照）
 * - undecided の案件で proposalDate < 今日 かつ proposalStatus が "preparing" のものを
 *   "waiting_response"（提案済・回答待ち）に自動更新する
 */
export async function GET(request: NextRequest) {
  // Vercel Cron の認証トークン確認
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.project.updateMany({
    where: {
      status: "undecided",
      proposalStatus: "preparing",
      proposalDate: { lt: today },
    },
    data: {
      proposalStatus: "waiting_response",
      statusUpdatedAt: new Date(),
    },
  });

  return Response.json({
    ok: true,
    updated: result.count,
    message: `${result.count} 件の提案ステータスを「提案済・回答待ち」に更新しました`,
  });
}
