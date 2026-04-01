"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  INVOLVEMENT_OPTIONS,
  INVOLVEMENT_LABELS,
  SKILL_LEVEL_OPTIONS,
  SKILL_LEVEL_LABELS,
  LOAD_MATRIX,
  SUB_PROJECT_BUSINESS_CONTENTS,
  type Involvement,
  type SkillLevel,
} from "@/lib/constants";

type User = { id: string; name: string; department: string };
type AssigneeEntry = { userId: string; involvement: Involvement; skillLevel: SkillLevel };

export default function NewSubProjectPage() {
  const router = useRouter();
  const params = useParams();
  const parentId = String(params.id);

  const [parentName, setParentName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [continueAdding, setContinueAdding] = useState(false);

  const [form, setForm] = useState({
    name: "",
    businessContent: "",
    departmentBudget: "",
    periodStart: "",
    periodEnd: "",
  });
  const [assignees, setAssignees] = useState<AssigneeEntry[]>([]);

  useEffect(() => {
    // セッション取得（自分のuserIdを知るため）
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => {});
    // ユーザー一覧
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
    // 親案件情報を取得して名前と担当者を初期設定
    fetch(`/api/projects/${parentId}`)
      .then((r) => r.json())
      .then((data) => {
        setParentName(data.name ?? "");
        // 親案件の担当者をデフォルト担当者として設定（関わり度=MAIN、スキルLv=2）
        const parentAssigneeIds = new Set<string>();
        const initial: AssigneeEntry[] = [];
        if (Array.isArray(data.assignees)) {
          for (const a of data.assignees) {
            parentAssigneeIds.add(a.user.id);
            initial.push({
              userId: a.user.id,
              involvement: "MAIN" as Involvement,
              skillLevel: 2 as SkillLevel,
            });
          }
        }
        setAssignees(initial);
        // 自分が含まれていない場合は後で追加（sessionUserIdが取れたタイミングで）
        setSessionUserId((sid) => {
          if (sid && !parentAssigneeIds.has(sid)) {
            setAssignees((prev) => {
              if (prev.some((a) => a.userId === sid)) return prev;
              return [{ userId: sid, involvement: "MAIN" as Involvement, skillLevel: 2 as SkillLevel }, ...prev];
            });
          }
          return sid;
        });
      })
      .catch(() => {});
  }, [parentId]);

  function addAssignee() {
    setAssignees((prev) => [
      ...prev,
      { userId: "", involvement: "MAIN", skillLevel: 2 },
    ]);
  }

  function removeAssignee(idx: number) {
    setAssignees((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAssignee(idx: number, field: keyof AssigneeEntry, value: string | number) {
    setAssignees((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a))
    );
  }

  // リアルタイムスコア計算
  const assigneeScores = assignees.map((a) =>
    a.userId && a.involvement && a.skillLevel
      ? LOAD_MATRIX[a.involvement]?.[a.skillLevel] ?? 0
      : 0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.departmentBudget) {
      setError("部門予算は必須です");
      return;
    }
    const invalidAssignee = assignees.some((a) => !a.userId);
    if (invalidAssignee) {
      setError("担当者を選択してください");
      return;
    }
    const userIds = assignees.filter((a) => a.userId).map((a) => a.userId);
    if (new Set(userIds).size !== userIds.length) {
      setError("同じ担当者が重複しています。担当者を確認してください。");
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
          assignees: assignees.filter((a) => a.userId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登録に失敗しました");

      if (continueAdding) {
        // フォームをリセットして続けて追加（担当者は親案件のデフォルトを保持）
        setForm({ name: "", businessContent: "", departmentBudget: "", periodStart: "", periodEnd: "" });
        setContinueAdding(false);
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
        <Link
          href={`/mypage/projects/${parentId}`}
          className="text-sm text-amber-700 hover:underline"
        >
          ← {parentName || "親案件"} へ戻る
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-bold text-stone-800">子案件を追加</h1>
      {parentName && (
        <p className="mb-4 text-sm text-stone-500">親案件：{parentName}</p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded border border-stone-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            プロジェクト名 *
          </label>
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
              実施開始日
              <span className="ml-1 text-xs font-normal text-stone-400">（日不明時は1日）</span>
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
              実施終了日
              <span className="ml-1 text-xs font-normal text-stone-400">（日不明時は1日）</span>
            </label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        {/* 担当者アサイン */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-stone-700">担当者・負荷設定</label>
            <button
              type="button"
              onClick={addAssignee}
              className="text-sm text-amber-700 hover:underline"
            >
              ＋ 担当者を追加
            </button>
          </div>

          {assignees.length === 0 ? (
            <p className="rounded border border-dashed border-stone-300 p-4 text-center text-sm text-stone-400">
              「担当者を追加」から設定してください
            </p>
          ) : (
            <div className="space-y-3">
              {assignees.map((a, idx) => {
                const score = assigneeScores[idx];
                return (
                  <div key={idx} className="rounded border border-stone-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-stone-500">担当者 *</label>
                        <select
                          value={a.userId}
                          onChange={(e) => updateAssignee(idx, "userId", e.target.value)}
                          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">選択</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.department} / {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-stone-500">関わり度 *</label>
                        <select
                          value={a.involvement}
                          onChange={(e) => updateAssignee(idx, "involvement", e.target.value as Involvement)}
                          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                        >
                          {INVOLVEMENT_OPTIONS.map((inv) => (
                            <option key={inv} value={inv}>{INVOLVEMENT_LABELS[inv]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-stone-500">スキルレベル *</label>
                        <select
                          value={a.skillLevel}
                          onChange={(e) => updateAssignee(idx, "skillLevel", Number(e.target.value) as SkillLevel)}
                          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                        >
                          {SKILL_LEVEL_OPTIONS.map((lv) => (
                            <option key={lv} value={lv}>{SKILL_LEVEL_LABELS[lv]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-stone-500">
                        負荷スコア：
                        <span className={`font-bold ${score >= 8 ? "text-red-600" : score >= 5 ? "text-amber-600" : "text-emerald-600"}`}>
                          {score}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAssignee(idx)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
              {assignees.length > 0 && (
                <p className="text-right text-xs text-stone-500">
                  この子案件の合計負荷スコア：
                  <span className="font-bold text-stone-800">
                    {assigneeScores.reduce((s, v) => s + v, 0)}
                  </span>
                </p>
              )}
            </div>
          )}
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
          <Link
            href={`/mypage/projects/${parentId}`}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
