"use client";

import { useEffect, useState } from "react";

type Summary = {
  department: string;
  name: string;
  decidedSales: number;
  decidedLoad: number;
  proposalLoad: number;
  totalLoad: number;
  loadLabel: string;
  proposalBudget: number;
  proposalCount: number;
};

export function MypageSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/mypage/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary) return <div className="rounded border border-stone-200 bg-white p-4 text-stone-500">読み込み中…</div>;

  return (
    <section className="rounded border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-stone-600">サマリー</h2>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-xs text-stone-500">部署</p>
          <p className="font-medium">{summary.department}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">氏名</p>
          <p className="font-medium">{summary.name}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">決定売上（部門予算合計）</p>
          <p className="font-medium">¥{summary.decidedSales.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">提案案件数 / 提案予算</p>
          <p className="font-medium">{summary.proposalCount}件 / ¥{summary.proposalBudget.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">負荷スコア（決定 / 提案）</p>
          <p className="font-medium">{summary.decidedLoad} / {summary.proposalLoad}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">合計負荷 / 判定</p>
          <p className="font-medium">{summary.totalLoad} / {summary.loadLabel}</p>
        </div>
      </div>
    </section>
  );
}
