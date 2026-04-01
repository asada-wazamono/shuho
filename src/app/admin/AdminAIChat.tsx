"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const mdComponents: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-bold text-stone-800">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-base font-bold text-stone-800">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold text-stone-700">{children}</h3>,
  p:  ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-stone-700">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-stone-600">{children}</em>,
  hr: () => <hr className="my-3 border-stone-200" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-amber-400 pl-3 text-stone-600">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-stone-100">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-stone-200 odd:bg-white even:bg-stone-50">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-stone-300 px-3 py-1.5 font-medium text-stone-700">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-stone-200 px-3 py-1.5 text-stone-700">{children}</td>
  ),
  code: ({ children }) => (
    <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs text-stone-700">{children}</code>
  ),
};

function MarkdownAnswer({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}

// 現在の会話ターン（セッション内マルチターン）
type ConversationTurn = {
  role: "user" | "ai";
  text: string;
};

// DB保存済み履歴アイテム
type HistoryLog = {
  id: string;
  question: string;
  answer: string;
  mode: string;
  createdAt: string;
};

export function AdminAIChat() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // マルチターン会話（セッション内）
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);

  // DB保存履歴（前回セッションなど）
  const [dbHistory, setDbHistory] = useState<HistoryLog[]>([]);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // マウント時にDB履歴を取得
  useEffect(() => {
    fetch("/api/ai/history")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDbHistory(data as HistoryLog[]);
      })
      .catch(() => {});
  }, []);

  // 新しいメッセージが来たら一番下にスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, loading]);

  // 現在の会話から conversationHistory（Q&Aペア）を生成
  function buildConversationHistory() {
    const pairs: { question: string; answer: string }[] = [];
    for (let i = 0; i + 1 < conversation.length; i += 2) {
      const userTurn = conversation[i];
      const aiTurn = conversation[i + 1];
      if (userTurn?.role === "user" && aiTurn?.role === "ai") {
        pairs.push({ question: userTurn.text, answer: aiTurn.text });
      }
    }
    return pairs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    // ユーザー発言を追加
    setConversation((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    setError("");

    try {
      const conversationHistory = buildConversationHistory();

      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, conversationHistory }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "回答を取得できませんでした");

      const text = String(data.answer ?? "");

      // AI回答を追加
      setConversation((prev) => [...prev, { role: "ai", text }]);

      // DB履歴を再取得（最新の回答が保存されたので）
      fetch("/api/ai/history")
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setDbHistory(d as HistoryLog[]); })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "回答を取得できませんでした");
      // エラーのとき追加したユーザー発言を削除
      setConversation((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setConversation([]);
    setError("");
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <section className="rounded border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">AIアシスタント</h2>
        {conversation.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            会話をリセット
          </button>
        )}
      </div>

      {/* 会話エリア */}
      <div className="mb-3 max-h-[420px] min-h-[120px] overflow-y-auto rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
        {conversation.length === 0 && !loading && (
          <p className="text-stone-500">質問を入力すると、ここに会話が表示されます。</p>
        )}
        {conversation.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="mb-3 flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-amber-100 px-3 py-2 text-stone-800">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="mb-3 flex justify-start">
              <div className="max-w-[92%] rounded-lg bg-white px-3 py-2 shadow-sm">
                <MarkdownAnswer text={turn.text} />
              </div>
            </div>
          )
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-white px-3 py-2 text-stone-400 shadow-sm">
              回答を生成中...
            </div>
          </div>
        )}
        {error && (
          <p className="mt-1 text-red-600">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={conversation.length > 0 ? "続けて質問できます…" : "質問を入力してください"}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            送信
          </button>
        </div>
        {conversation.length > 0 && (
          <p className="text-xs text-stone-400">
            {Math.floor(conversation.length / 2)} ターン目 ／ 前の会話を踏まえて回答します
          </p>
        )}
      </form>

      {/* DB履歴アコーディオン */}
      {dbHistory.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-stone-600">過去の質問履歴（直近5件）</h3>
          <div className="space-y-1.5">
            {dbHistory.map((log) => (
              <div key={log.id} className="rounded border border-stone-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenHistoryId(openHistoryId === log.id ? null : log.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                >
                  <span className="mr-2 flex-1 truncate text-stone-700">
                    Q. {log.question}
                  </span>
                  <span className="shrink-0 text-xs text-stone-400">
                    {formatDate(log.createdAt)}
                    <span className="ml-2">{openHistoryId === log.id ? "▲" : "▼"}</span>
                  </span>
                </button>
                {openHistoryId === log.id && (
                  <div className="border-t border-stone-100 px-3 py-2 text-sm text-stone-700">
                    <MarkdownAnswer text={log.answer} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
