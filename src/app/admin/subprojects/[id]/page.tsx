"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  INVOLVEMENT_OPTIONS,
  INVOLVEMENT_LABELS,
  SKILL_LEVEL_OPTIONS,
  SKILL_LEVEL_LABELS,
  SUB_PROJECT_STATUS_OPTIONS,
  SUB_PROJECT_STATUS_LABELS,
  LOAD_MATRIX,
  SUB_PROJECT_BUSINESS_CONTENTS,
  type Involvement,
  type SkillLevel,
  type SubProjectStatus,
} from "@/lib/constants";

type User = { id: string; name: string; department: string };
type AssigneeEntry = { userId: string; involvement: Involvement; skillLevel: SkillLevel };

type SubProject = {
  id: string;
  name: string;
  status: string;
  departmentBudget: number | null;
  businessContent: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  parent: { id: string; name: string; client: { name: string } };
  assignees: {
    userId: string;
    involvement: string;
    skillLevel: number;
    user: { id: string; name: string; department: string };
  }[];
};

export default function AdminSubProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [subProject, setSubProject] = useState<SubProject | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    status: "active",
    departmentBudget: "" as string | number,
    businessContent: "",
    periodStart: "",
    periodEnd: "",
  });
  const [assignees, setAssignees] = useState<AssigneeEntry[]>([]);

  function loadData(data: SubProject) {
    setSubProject(data);
    setForm({
      name: data.name,
      status: data.status,
      departmentBudget: data.departmentBudget ?? "",
      businessContent: data.businessContent ?? "",
      periodStart: data.periodStart ? data.periodStart.slice(0, 10) : "",
      periodEnd: data.periodEnd ? data.periodEnd.slice(0, 10) : "",
    });
    setAssignees(
      data.assignees.map((a) => ({
        userId: a.userId,
        involvement: a.involvement as Involvement,
        skillLevel: a.skillLevel as SkillLevel,
      }))
    );
  }

  useEffect(() => {
    fetch(`/api/subprojects/${id}`)
      .then((r) => r.json())
      .then(loadData)
      .catch(() => setSubProject(null));
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, [id]);

  function addAssignee() {
    setAssignees((prev) => [...prev, { userId: "", involvement: "MAIN", skillLevel: 2 }]);
  }

  function removeAssignee(idx: number) {
    setAssignees((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAssignee(idx: number, field: keyof AssigneeEntry, value: string | number) {
    setAssignees((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }

  const assigneeScores = assignees.map((a) =>
    a.userId ? (LOAD_MATRIX[a.involvement]?.[a.skillLevel] ?? 0) : 0
  );
  const totalScore = assigneeScores.reduce((s, v) => s + v, 0);

  async function handleSave() {
    setError("");
    const invalidAssignee = assignees.some((a) => !a.userId);
    if (invalidAssignee) {
      setError("担当者を選択してください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/subprojects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          status: form.status,
          departmentBudget: form.departmentBudget !== "" ? Number(form.departmentBudget) : null,
          businessContent: form.businessContent || null,
          periodStart: form.periodStart || null,
          periodEnd: form.periodEnd || null,
          assignees: assignees.filter((a) => a.userId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新に失敗しました");
      loadData(data);
      setSavedMessage("更新しました");
      setTimeout(() => setSavedMessage(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("この子案件を削除しますか？")) return;
    const res = await fetch(`/api/subprojects/${id}`, { method: "DELETE" });
    if (!res.ok) { alert("削除に失敗しました"); return; }
    router.push(`/admin/projects/${subProject?.parent.id}`);
    router.refresh();
  }

  if (!subProject) return <p className="p-4 text-stone-500">読み込み中…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="mb-2">
        <Link
          href={`/admin/projects/${subProject.parent.id}`}
          className="text-sm text-amber-700 hover:underline"
        >
          ← {subProject.parent.name} へ戻る
        </Link>
        <Link href="/admin?tab=decided" className="text-sm text-stone-500 hover:underline">
          決定案件一覧へ
        </Link>
      </p>

      <div>
        <h1 className="text-xl font-bold text-stone-800">{subProject.name}</h1>
        <p className="text-sm text-stone-500">{subProject.parent.client.name} / {subProject.parent.name}</p>
      </div>

      <div className="rounded border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">プロジェクト名 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">ステータス</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
          >
            {SUB_PROJECT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{SUB_PROJECT_STATUS_LABELS[s as SubProjectStatus]}</option>
            ))}
          </select>
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
          <label className="mb-1 block text-sm font-medium text-stone-700">部門予算 *</label>
          <input
            type="number"
            value={form.departmentBudget}
            onChange={(e) => setForm((f) => ({ ...f, departmentBudget: e.target.value }))}
            className="no-spinner w-full max-w-xs rounded border border-stone-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-stone-600">実施開始日</label>
            <input
              type="date"
              value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-stone-600">実施終了日</label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        {/* 担当者・負荷 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-stone-700">
              担当者・負荷設定
              {totalScore > 0 && (
                <span className="ml-2 text-xs font-normal text-stone-500">
                  合計負荷スコア：<span className="font-bold text-stone-800">{totalScore}</span>
                </span>
              )}
            </label>
            <button type="button" onClick={addAssignee} className="text-sm text-amber-700 hover:underline">
              ＋ 追加
            </button>
          </div>
          <div className="space-y-3">
            {assignees.map((a, idx) => {
              const score = assigneeScores[idx];
              return (
                <div key={idx} className="rounded border border-stone-200 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">担当者</label>
                      <select
                        value={a.userId}
                        onChange={(e) => updateAssignee(idx, "userId", e.target.value)}
                        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">選択</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.department} / {u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">関わり度</label>
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
                      <label className="mb-1 block text-xs text-stone-500">スキルレベル</label>
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
                    <button type="button" onClick={() => removeAssignee(idx)} className="text-xs text-red-500 hover:underline">削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {savedMessage && <span className="self-center text-sm text-emerald-600">{savedMessage}</span>}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50"
          >
            削除
          </button>
          <Link
            href={`/admin/projects/${subProject.parent.id}`}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            親案件へ
          </Link>
        </div>
      </div>
    </div>
  );
}
