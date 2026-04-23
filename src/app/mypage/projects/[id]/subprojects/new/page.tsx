"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  INVOLVEMENT_OPTIONS,
  INVOLVEMENT_LABELS,
  SUB_PROJECT_BUSINESS_CONTENTS,
  type Involvement,
} from "@/lib/constants";

type User = { id: string; name: string; department: string };
type AssigneeEntry = { userId: string; involvement: Involvement };

export default function NewSubProjectPage() {
  const router = useRouter();
  const params = useParams();
  const parentId = String(params.id);

  const [parentName, setParentName] = useState("");
  const [hasExistingSubProjects, setHasExistingSubProjects] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [continueAdding, setContinueAdding] = useState(false);

  const [form, setForm] = useState({
    name: "",
    businessContent: "",
    departmentBudget: "",
    periodStart: "",
    periodEnd: "",
    note: "",
  });
  const [assignees, setAssignees] = useState<AssigneeEntry[]>([]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
    fetch(`/api/projects/${parentId}`)
      .then((r) => r.json())
      .then((data) => {
        setParentName(data.name ?? "");
        setHasExistingSubProjects(
          Array.isArray(data.subProjects) && data.subProjects.length > 0
        );
        if (data.note) {
          setForm((f) => ({ ...f, note: data.note }));
        }
        if (Array.isArray(data.assignees)) {
          setAssignees(
            data.assignees.map((a: { user: { id: string } }) => ({
              userId: a.user.id,
              involvement: "SUB" as Involvement,
            }))
          );
        }
      })
      .catch(() => {});
  }, [parentId]);

  function addAssignee(userId: string) {
    if (!userId || assignees.some((a) => a.userId === userId)) return;
    setAssignees((prev) => [...prev, { userId, involvement: "SUB" as Involvement }]);
  }

  function removeAssignee(userId: string) {
    setAssignees((prev) => prev.filter((a) => a.userId !== userId));
  }

  function updateInvolvement(userId: string, inv: Involvement) {
    setAssignees((prev) => prev.map((a) => a.userId === userId ? { ...a, involvement: inv } : a));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.departmentBudget) {
      setError("部門予算は必須です");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subprojects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          name: form.name,
          businessContent: form.businessContent || null,
          departmentBudget: Number(form.departmentBudget),
          periodStart: form.periodStart || null,
          periodEnd: form.periodEnd || null,
          note: form.note || null,
          assignees: assignees.filter((a) => a.userId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登録に失敗しました");

      if (continueAdding) {
        setForm({ name: "", businessContent: "", departmentBudget: "", periodStart: "", periodEnd: "", note: "" });
        setContinueAdding(false);
        setHasExistingSubProjects(true);
      } else {
        router.push(`/mypage/projects/${parentId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link href={`/mypage/projects/${parentId}`} className="text-sm text-amber-700 hover:underline">
          ← {parentName || "親案件"} へ戻る
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-bold text-stone-800">子案件を追加</h1>
      {parentName && <p className="mb-2 text-sm text-stone-500">親案件：{parentName}</p>}

      {!hasExistingSubProjects && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠ 決定案件には子案件を最低1件登録してください
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded border border-stone-200 bg-white p-6 shadow-sm">
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">プロジェクト名 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="例：Web CM制作、店頭イベント企画"
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">業務内容</label>
          <select
            value={form.businessContent}
            onChange={(e) => setForm((f) => ({ ...f, businessContent: e.target.value }))}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            <option value="">選択してください</option>
            {SUB_PROJECT_BUSINESS_CONTENTS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            部門予算 * <span className="text-xs font-normal text-stone-400">（円）</span>
          </label>
          <input
            type="number"
            value={form.departmentBudget}
            onChange={(e) => setForm((f) => ({ ...f, departmentBudget: e.target.value }))}
            required
            placeholder="例：2000000"
            className="no-spinner w-full rounded border border-stone-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              実施開始日<span className="ml-1 text-xs font-normal text-stone-400">（日不明時は1日）</span>
            </label>
            <input
              type="date"
              value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              実施終了日<span className="ml-1 text-xs font-normal text-stone-400">（日不明時は1日）</span>
            </label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">備考</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            rows={3}
            placeholder="備考があれば入力"
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </div>

        {/* 担当者（追加型） */}
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">担当者・関わり度</label>
          <div className="space-y-1.5">
            {assignees.map((a) => {
              const u = users.find((u) => u.id === a.userId);
              if (!u) return null;
              return (
                <div key={a.userId} className="flex items-center gap-2 rounded border border-stone-200 bg-white px-3 py-2 text-sm">
                  <span className="flex-1">{u.department} / {u.name}</span>
                  <label className="flex items-center gap-1 text-xs text-stone-500">
                    関わり度：
                    <select
                      value={a.involvement}
                      onChange={(e) => updateInvolvement(u.id, e.target.value as Involvement)}
                      className="rounded border border-stone-300 px-2 py-0.5 text-xs"
                    >
                      {INVOLVEMENT_OPTIONS.map((inv) => (
                        <option key={inv} value={inv}>{INVOLVEMENT_LABELS[inv]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAssignee(u.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </div>
              );
            })}
            {users.filter((u) => !assignees.some((a) => a.userId === u.id)).length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) { addAssignee(e.target.value); e.currentTarget.value = ""; } }}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500"
              >
                <option value="">＋ 担当者を追加</option>
                {users
                  .filter((u) => !assignees.some((a) => a.userId === u.id))
                  .map((u) => <option key={u.id} value={u.id}>{u.department} / {u.name}</option>)
                }
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-4">
          <button
            type="submit"
            disabled={loading}
            onClick={() => setContinueAdding(false)}
            className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "登録中…" : "登録"}
          </button>
          <button
            type="submit"
            disabled={loading}
            onClick={() => setContinueAdding(true)}
            className="rounded border border-amber-600 px-4 py-2 font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            登録して続けて追加
          </button>
          {hasExistingSubProjects ? (
            <Link
              href={`/mypage/projects/${parentId}`}
              className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
            >
              キャンセル
            </Link>
          ) : (
            <Link
              href={`/mypage/projects/${parentId}`}
              className="rounded border border-stone-200 px-4 py-2 text-stone-400 hover:bg-stone-50 text-sm"
            >
              子案件を追加せず親案件へ戻る
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
