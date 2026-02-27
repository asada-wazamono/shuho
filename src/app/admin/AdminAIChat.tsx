"use client";

import { FormEvent, useState } from "react";

type HistoryItem = {
  question: string;
  answer: string;
};

function parseTableBlock(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  if (!lines[0].includes("|")) return null;
  if (!/^\|?[\s:-|]+\|?$/.test(lines[1])) return null;

  const splitRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow).filter((r) => r.length > 0);
  return { headers, rows };
}

function renderAnswer(answer: string) {
  const blocks = answer.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const table = parseTableBlock(block);
    if (table) {
      return (
        <div key={`tbl-${index}`} className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-stone-100 text-stone-700">
                {table.headers.map((h, i) => (
                  <th key={`h-${index}-${i}`} className="border border-stone-300 px-2 py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rIdx) => (
                <tr key={`r-${index}-${rIdx}`} className="odd:bg-white even:bg-stone-50">
                  {row.map((cell, cIdx) => (
                    <td key={`c-${index}-${rIdx}-${cIdx}`} className="border border-stone-200 px-2 py-1">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p key={`p-${index}`} className="mb-2 whitespace-pre-wrap">
        {block}
      </p>
    );
  });
}

export function AdminAIChat() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "回答を取得できませんでした");

      const text = String(data.answer ?? "");
      setAnswer(text);
      setHistory((prev) => [{ question: q, answer: text }, ...prev].slice(0, 3));
      setQuestion("");
    } catch {
      setError("回答を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-stone-800">AIアシスタント</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="質問を入力してください"
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </form>

      <div className="mt-3 min-h-[100px] rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
        {loading && <p>回答を生成中...</p>}
        {!loading && error && <p>{error}</p>}
        {!loading && !error && answer && <div>{renderAnswer(answer)}</div>}
        {!loading && !error && !answer && <p className="text-stone-500">ここに回答が表示されます。</p>}
      </div>

      {history.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-stone-700">直近3件の履歴</h3>
          {history.map((h, i) => (
            <div key={`${h.question}-${i}`} className="rounded border border-stone-200 p-3 text-sm">
              <p className="font-medium text-stone-800">Q. {h.question}</p>
              <div className="mt-1 text-stone-700">A. {renderAnswer(h.answer)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
