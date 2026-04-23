"use client";

import { useEffect, useState } from "react";
import { PROPOSAL_STATUS_OPTIONS, PROPOSAL_STATUS_LABELS } from "@/lib/constants";

type ReminderItem = {
  id: string;
  name: string;
  clientName: string;
  projectType: string;
  proposalDate: string;
  proposalStatus: string;
  daysElapsed: number;
};

export function ProposalReminderModal() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [open, setOpen] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/mypage/proposal-reminders")
      .then((r) => r.json())
      .then((data: ReminderItem[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setItems(data);
          const map: Record<string, string> = {};
          for (const item of data) map[item.id] = item.proposalStatus;
          setStatusMap(map);
          setOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave(projectId: string) {
    const proposalStatus = statusMap[projectId];
    const original = items.find((i) => i.id === projectId)?.proposalStatus;
    if (!proposalStatus || proposalStatus === original) return;
    setSavingId(projectId);
    try {
      const r = await fetch("/api/mypage/proposal-reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, proposalStatus }),
      });
      if (r.ok) {
        setSavedIds((prev) => new Set(prev).add(projectId));
      }
    } finally {
      setSavingId(null);
    }
  }

  if (!open || items.length === 0) return null;

  const allSaved = items.every((item) => savedIds.has(item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-start gap-3 rounded-t-xl bg-amber-50 px-6 py-4 border-b border-amber-200">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-bold text-stone-800">提案後1週間が経過した案件があります（{items.length}件）</p>
            <p className="text-xs text-stone-500 mt-0.5">その後どうなりましたか？ステータスを更新してください</p>
          </div>
        </div>

        {/* 案件リスト */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
          {items.map((item) => {
            const isSaved = savedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`rounded-lg border px-4 py-3 ${isSaved ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{item.clientName}</p>
                    <p className="text-xs text-stone-500">└ {item.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-stone-400">{new Date(item.proposalDate).toLocaleDateString("ja-JP")}</span>
                    <p className="text-xs font-medium text-amber-600">{item.daysElapsed}日経過</p>
                  </div>
                </div>
                {isSaved ? (
                  <p className="text-xs font-medium text-emerald-600">✓ 更新しました</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={statusMap[item.id] ?? "waiting_response"}
                      onChange={(e) => setStatusMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="flex-1 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {PROPOSAL_STATUS_OPTIONS.filter((s) => s !== "preparing").map((s) => (
                        <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSave(item.id)}
                      disabled={savingId === item.id || statusMap[item.id] === item.proposalStatus}
                      className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {savingId === item.id ? "保存中…" : "更新"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 border-t border-stone-200 px-6 py-4">
          {!allSaved && (
            <p className="mr-auto text-xs text-stone-400 self-center">
              ※ 未更新の案件は次回ログイン時にも表示されます
            </p>
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            {allSaved ? "閉じる" : "あとで"}
          </button>
        </div>
      </div>
    </div>
  );
}
