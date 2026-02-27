"use client";

import { useEffect, useState } from "react";

type AiQueryLog = {
  id: string;
  userId: string;
  userName: string;
  question: string;
  mode: string;
  createdAt: string;
};

export default function AiLogsPage() {
  const [logs, setLogs] = useState<AiQueryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai-logs")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => setLogs(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-stone-800">AIクエリログ</h1>
      {loading ? (
        <p className="text-stone-500">読み込み中...</p>
      ) : error ? (
        <p className="text-red-500">エラー: {error}</p>
      ) : logs.length === 0 ? (
        <p className="text-stone-500">ログがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-100 text-left text-stone-600">
                <th className="px-3 py-2 border border-stone-200 whitespace-nowrap">日時</th>
                <th className="px-3 py-2 border border-stone-200 whitespace-nowrap">ユーザー</th>
                <th className="px-3 py-2 border border-stone-200 whitespace-nowrap">ルート</th>
                <th className="px-3 py-2 border border-stone-200">質問</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2 border border-stone-200 whitespace-nowrap text-stone-500">
                    {new Date(log.createdAt).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 border border-stone-200 whitespace-nowrap">{log.userName}</td>
                  <td className="px-3 py-2 border border-stone-200 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        log.mode === "A"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {log.mode === "A" ? "A: SQL集計" : "B: JSON分析"}
                    </span>
                  </td>
                  <td className="px-3 py-2 border border-stone-200">{log.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
