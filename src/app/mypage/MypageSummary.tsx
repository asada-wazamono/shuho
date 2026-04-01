"use client";

import { useEffect, useState } from "react";

type Summary = {
  department: string;
  name: string;
  decidedSales: number;
  optionalTotal: number;
  loadScore: number;
  loadLabel: string;
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="text-xs text-stone-500">負荷スコア / 判定</p>
          <p className="font-medium">{summary.loadScore} / {summary.loadLabel}</p>
        </div>
      </div>
    </section>
  );
}
