"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  CERTAINTY_OPTIONS,
  DEPARTMENTS,
  BUSINESS_CONTENTS,
  PROPOSAL_STATUS_OPTIONS,
  PROPOSAL_STATUS_LABELS,
  EXECUTION_STATUS_OPTIONS,
  EXECUTION_STATUS_LABELS,
  PROJECT_TYPES,
  SUB_PROJECT_STATUS_LABELS,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_OPTIONS,
  type ExecutionStatus,
  type SubProjectStatus,
  type Involvement,
} from "@/lib/constants";

type SubProjectAssignee = {
  userId: string;
  involvement: string;
  skillLevel: number;
  user: { id: string; name: string; department: string };
};

type SubProject = {
  id: string;
  name: string;
  status: string;
  departmentBudget: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  assignees: SubProjectAssignee[];
};

type Project = {
  id: string;
  name: string;
  status: string;
  ownerDepartment: string;
  client: { id: string; name: string };
  projectType: string;
  competitorSituation: string | null;
  certainty: string;
  businessContent: string;
  totalBudget: number | null;
  optionalAmount: number | null;
  proposalDate: string | null;
  periodStart: string | null;
  note: string | null;
  proposalStatus: string | null;
  projectStatus: string | null;
  badReason: string | null;
  statusUpdatedAt: string | null;
  assignees: { userId: string; involvement: string; user: { id: string; name: string; department: string } }[];
  subProjects: SubProject[];
  mergedProjects: { id: string; name: string; status: string }[];
};

export default function AdminProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; department: string }[]>([]);
  const [assigneesTouched, setAssigneesTouched] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  function addAssignee(userId: string) {
    setAssigneesTouched(true);
    setForm((f) => {
      if (f.assignees.some((a) => a.userId === userId)) return f;
      return { ...f, assignees: [...f.assignees, { userId, involvement: "SUB" as Involvement }] };
    });
  }
  function removeAssignee(userId: string) {
    setAssigneesTouched(true);
    setForm((f) => ({ ...f, assignees: f.assignees.filter((a) => a.userId !== userId) }));
  }
  function updateInvolvement(userId: string, inv: Involvement) {
    setAssigneesTouched(true);
    setForm((f) => ({
      ...f,
      assignees: f.assignees.map((a) => a.userId === userId ? { ...a, involvement: inv } : a),
    }));
  }

  async function handleNameSave() {
    const trimmed = nameInput.trim();
    if (!trimmed || !project || trimmed === project.name) { setEditingName(false); return; }
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setProject((p) => p ? { ...p, name: trimmed } : p);
      setSavedMessage("案件名を変更しました");
      setTimeout(() => setSavedMessage(""), 2000);
    }
    setEditingName(false);
  }

  type AssigneeEntry = { userId: string; involvement: Involvement };
  const [form, setForm] = useState({
    status: "undecided",
    certainty: "B(50%)",
    ownerDepartment: "",
    businessContent: "",
    projectType: "AE提案",
    competitorSituation: "",
    totalBudget: "" as string | number,
    optionalAmount: "" as string | number,
    proposalDate: "",
    periodStart: "",
    note: "",
    proposalStatus: "preparing",
    projectStatus: "active",
    badReason: "",
    assignees: [] as AssigneeEntry[],
  });

  function loadProject(data: Project) {
    setProject(data);
    setForm({
      status: data.status,
      certainty: data.certainty,
      ownerDepartment: data.ownerDepartment,
      businessContent: data.businessContent,
      projectType: data.projectType,
      competitorSituation: data.competitorSituation ?? "",
      totalBudget: data.totalBudget ?? "",
      optionalAmount: data.optionalAmount ?? "",
      proposalDate: data.proposalDate ? data.proposalDate.slice(0, 10) : "",
      periodStart: data.periodStart ? data.periodStart.slice(0, 10) : "",
      note: data.note ?? "",
      proposalStatus: data.proposalStatus ?? "preparing",
      projectStatus: data.projectStatus ?? "active",
      badReason: data.badReason ?? "",
      assignees: data.assignees?.map((a) => ({ userId: a.userId, involvement: (a.involvement || "SUB") as Involvement })) ?? [],
    });
  }

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then(loadProject)
      .catch(() => setProject(null));
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, [id]);

  function targetTab(status?: string) {
    if (status === "good") return "decided";
    if (status === "bad") return "bad";
    return "proposal";
  }

  async function handleSave() {
    if (form.status === "bad" && !form.badReason.trim()) {
      alert("Badの理由を入力してください");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      status: form.status,
      certainty: form.certainty,
      ownerDepartment: form.ownerDepartment,
      businessContent: form.businessContent,
      projectType: form.projectType,
      competitorSituation: form.projectType === "競合コンペ" ? form.competitorSituation : null,
      totalBudget: form.totalBudget !== "" ? Number(form.totalBudget) : null,
      optionalAmount: form.optionalAmount !== "" ? Number(form.optionalAmount) : null,
      proposalDate: form.proposalDate || null,
      periodStart: form.periodStart || null,
      note: form.note || null,
      proposalStatus: form.status === "undecided" ? form.proposalStatus : undefined,
      projectStatus: form.status === "good" ? form.projectStatus : undefined,
      badReason: form.status === "bad" ? form.badReason : undefined,
    };
    if (assigneesTouched) payload.assignees = form.assignees;

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新に失敗しました");

      loadProject(data);
      setSavedMessage("保存しました");
      setAssigneesTouched(false);
      setTimeout(() => setSavedMessage(""), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("この案件を削除しますか？")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "削除に失敗しました"); return; }
    router.push(`/admin?tab=${targetTab(form.status)}`);
    router.refresh();
  }

  async function handleUnmerge(absorbedId: string, absorbedName: string) {
    if (!confirm(`「${absorbedName}」との統合を解除しますか？\n解除後は別々の案件として扱われます。`)) return;
    const res = await fetch(`/api/admin/projects/${absorbedId}/merge`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "解除に失敗しました"); return; }
    // 再読み込みして mergedProjects を更新
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then(loadProject)
      .catch(() => {});
    setSavedMessage("統合を解除しました");
    setTimeout(() => setSavedMessage(""), 2000);
  }

  if (!project) return <p className="p-4 text-stone-500">読み込み中…</p>;

  const subProjectTotalBudget = project.subProjects.reduce(
    (sum, sp) => sum + (sp.departmentBudget ?? 0), 0
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin?tab=proposal" className="text-sm text-amber-700 hover:underline">← 提案案件一覧</Link>
        <Link href="/admin?tab=decided" className="text-sm text-stone-500 hover:underline">決定案件一覧</Link>
        <Link href="/admin?tab=bad" className="text-sm text-stone-500 hover:underline">Bad案件一覧</Link>
      </div>
      {editingName ? (
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={handleNameSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
          className="w-full rounded border border-amber-400 px-2 py-1 text-xl font-bold text-stone-800 focus:outline-none"
        />
      ) : (
        <h1
          className="cursor-pointer text-xl font-bold text-stone-800 hover:text-amber-700"
          title="クリックして案件名を変更"
          onClick={() => { setNameInput(project.name); setEditingName(true); }}
        >
          {project.name} <span className="text-sm font-normal text-stone-400">✎</span>
        </h1>
      )}

      {/* 編集フォーム */}
      <div className="rounded border border-stone-200 bg-white p-6 shadow-sm">

        {project.status === "good" ? (
          /* ── 決定案件：変更不要な項目はテキスト表示 ── */
          <div className="space-y-4">
            {/* 基本情報（表示のみ） */}
            <div className="rounded bg-stone-50 px-4 py-3">
              <dl className="grid gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="text-stone-500">クライアント</dt>
                <dd className="font-medium text-stone-800">{project.client.name}</dd>
                <dt className="text-stone-500">業務内容</dt>
                <dd className="text-stone-800">{project.businessContent}</dd>
                <dt className="text-stone-500">案件種別</dt>
                <dd className="text-stone-800">{project.projectType}{project.competitorSituation ? `（${project.competitorSituation}）` : ""}</dd>
                <dt className="text-stone-500">確度</dt>
                <dd className="text-stone-800">{project.certainty}</dd>
              </dl>
            </div>

            <hr className="border-stone-200" />

            {/* 実行ステータス */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">実行ステータス</label>
              <select
                value={form.projectStatus}
                onChange={(e) => setForm((f) => ({ ...f, projectStatus: e.target.value }))}
                className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
              >
                {EXECUTION_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{EXECUTION_STATUS_LABELS[s as ExecutionStatus]}</option>
                ))}
              </select>
            </div>

            {/* メイン担当部署 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">メイン担当部署</label>
              <select
                value={form.ownerDepartment}
                onChange={(e) => setForm((f) => ({ ...f, ownerDepartment: e.target.value }))}
                className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
              >
                <option value="">選択</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* 担当者（追加型） */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">担当者</label>
              <div className="space-y-1.5">
                {form.assignees.map((a) => {
                  const u = users.find((u) => u.id === a.userId);
                  if (!u) return null;
                  return (
                    <div key={a.userId} className="flex items-center justify-between rounded border border-stone-200 bg-white px-3 py-2 text-sm">
                      <span>{u.department} / {u.name}</span>
                      <button type="button" onClick={() => removeAssignee(u.id)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                    </div>
                  );
                })}
                {users.filter((u) => !form.assignees.some((a) => a.userId === u.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) { addAssignee(e.target.value); e.currentTarget.value = ""; } }}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500"
                  >
                    <option value="">＋ 担当者を追加</option>
                    {users
                      .filter((u) => !form.assignees.some((a) => a.userId === u.id))
                      .map((u) => <option key={u.id} value={u.id}>{u.department} / {u.name}</option>)
                    }
                  </select>
                )}
              </div>
            </div>

            {/* 全体予算 */}
            <div className="max-w-xs">
              <label className="mb-1 block text-sm text-stone-600">全体予算</label>
              <input
                type="number"
                value={form.totalBudget}
                onChange={(e) => setForm((f) => ({ ...f, totalBudget: e.target.value }))}
                className="no-spinner w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>

            {/* 提案日・実施想定日 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-stone-600">提案日</label>
                <input
                  type="date"
                  value={form.proposalDate}
                  onChange={(e) => setForm((f) => ({ ...f, proposalDate: e.target.value }))}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-stone-600">実施想定日</label>
                <input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </div>
            </div>

            {/* 備考 */}
            <div>
              <label className="mb-1 block text-sm text-stone-600">備考</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>

        ) : (
          /* ── 提案・Bad案件：従来通り全項目編集可 ── */
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <dt className="text-stone-500">クライアント</dt>
              <dd className="font-medium">{project.client.name}</dd>
            </dl>

            <hr className="border-stone-200" />

            {/* 業務内容 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">業務内容</label>
              <select
                value={form.businessContent}
                onChange={(e) => setForm((f) => ({ ...f, businessContent: e.target.value }))}
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {BUSINESS_CONTENTS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Good / Bad / 未定 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Good / Bad / 未定</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
              >
                <option value="undecided">未定</option>
                <option value="good">Good（決定）</option>
                <option value="bad">Bad</option>
              </select>
            </div>

            {/* ステータス（条件分岐） */}
            {form.status === "undecided" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">提案案件ステータス</label>
                <select
                  value={form.proposalStatus}
                  onChange={(e) => setForm((f) => ({ ...f, proposalStatus: e.target.value }))}
                  className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
                >
                  {PROPOSAL_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            )}
            {form.status === "bad" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  ダメだった理由 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.badReason}
                  onChange={(e) => setForm((f) => ({ ...f, badReason: e.target.value }))}
                  rows={3}
                  placeholder="何が原因でBadになったか記入してください"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
            )}

            {/* 案件種別 + コンペ状況 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">案件種別</label>
                <select
                  value={form.projectType}
                  onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                >
                  {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {form.projectType === "競合コンペ" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">コンペ状況</label>
                  <input
                    type="text"
                    value={form.competitorSituation}
                    onChange={(e) => setForm((f) => ({ ...f, competitorSituation: e.target.value }))}
                    placeholder="何社？入札？など"
                    className="w-full rounded border border-stone-300 px-3 py-2"
                  />
                </div>
              )}
            </div>

            {/* 確度 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">確度</label>
              <select
                value={form.certainty}
                onChange={(e) => setForm((f) => ({ ...f, certainty: e.target.value }))}
                className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
              >
                {CERTAINTY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* メイン担当部署 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">メイン担当部署</label>
              <select
                value={form.ownerDepartment}
                onChange={(e) => setForm((f) => ({ ...f, ownerDepartment: e.target.value }))}
                className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
              >
                <option value="">選択</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* 担当者（追加型・関わり度あり） */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">担当者</label>
              <div className="space-y-1.5">
                {form.assignees.map((a) => {
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
                      <button type="button" onClick={() => removeAssignee(u.id)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                    </div>
                  );
                })}
                {users.filter((u) => !form.assignees.some((a) => a.userId === u.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) { addAssignee(e.target.value); e.currentTarget.value = ""; } }}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500"
                  >
                    <option value="">＋ 担当者を追加</option>
                    {users
                      .filter((u) => !form.assignees.some((a) => a.userId === u.id))
                      .map((u) => <option key={u.id} value={u.id}>{u.department} / {u.name}</option>)
                    }
                  </select>
                )}
              </div>
            </div>

            {/* 予算 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-stone-600">全体予算 *</label>
                <input
                  type="number"
                  value={form.totalBudget}
                  onChange={(e) => setForm((f) => ({ ...f, totalBudget: e.target.value }))}
                  className="no-spinner w-full rounded border border-stone-300 px-3 py-2"
                />
              </div>
            </div>

            {/* 提案日・実施想定日 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-stone-600">提案日</label>
                <input
                  type="date"
                  value={form.proposalDate}
                  onChange={(e) => setForm((f) => ({ ...f, proposalDate: e.target.value }))}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-stone-600">実施想定日</label>
                <input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </div>
            </div>

            {/* 備考 */}
            <div>
              <label className="mb-1 block text-sm text-stone-600">備考</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
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
            href={`/admin?tab=${targetTab(form.status)}`}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            一覧へ
          </Link>
        </div>
      </div>

      {/* 統合済み案件セクション */}
      {project.mergedProjects && project.mergedProjects.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-amber-800">統合済みの案件（{project.mergedProjects.length}件）</h2>
          <div className="space-y-2">
            {project.mergedProjects.map((mp) => (
              <div key={mp.id} className="flex items-center justify-between rounded border border-amber-200 bg-white px-4 py-2">
                <span className="text-sm text-stone-700">{mp.name}</span>
                <button
                  onClick={() => handleUnmerge(mp.id, mp.name)}
                  className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-100"
                >
                  統合を解除
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-700">※ 解除すると元の案件として一覧に戻ります</p>
        </div>
      )}

      {/* 子案件セクション（Good確定後に表示） */}
      {project.status === "good" && (
        <div className="rounded border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-800">子案件一覧</h2>
            <Link
              href={`/admin/projects/${id}/subprojects/new`}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              ＋ 子案件を追加
            </Link>
          </div>

          {project.subProjects.length === 0 ? (
            <p className="text-sm text-stone-400">まだ子案件がありません。</p>
          ) : (
            <>
              <div className="space-y-3">
                {project.subProjects.map((sp) => (
                  <div key={sp.id} className="rounded border border-stone-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/subprojects/${sp.id}`}
                            className="font-medium text-stone-800 hover:text-amber-700 hover:underline"
                          >
                            {sp.name}
                          </Link>
                          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                            sp.status === "completed"
                              ? "bg-stone-100 text-stone-500"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {SUB_PROJECT_STATUS_LABELS[sp.status as SubProjectStatus] ?? sp.status}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                          {sp.departmentBudget != null && (
                            <span>部門予算：¥{sp.departmentBudget.toLocaleString()}</span>
                          )}
                          {sp.periodStart && <span>開始：{sp.periodStart.slice(0, 10)}</span>}
                          {sp.periodEnd && <span>終了：{sp.periodEnd.slice(0, 10)}</span>}
                        </div>
                        {sp.assignees.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {sp.assignees.map((a) => (
                              <span key={a.userId} className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                                {a.user.name}（{INVOLVEMENT_LABELS[a.involvement as keyof typeof INVOLVEMENT_LABELS] ?? a.involvement}）
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-stone-100 pt-3 text-right text-sm text-stone-600">
                部門予算合計：<span className="font-bold">¥{subProjectTotalBudget.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
