"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  CERTAINTY_OPTIONS,
  LOAD_LEVELS,
  DEPARTMENTS,
  BUSINESS_CONTENTS,
  PROPOSAL_STATUS_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROPOSAL_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  PROPOSAL_EFFORT_TYPES,
  PROPOSAL_EFFORT_LABELS,
  PROPOSAL_EFFORT_WEIGHTS,
  type ProposalEffortType,
} from "@/lib/constants";
import { projectLoadScore } from "@/lib/loadScore";

type Project = {
  id: string;
  name: string;
  status: string;
  ownerDepartment: string;
  client: { id: string; name: string };
  projectType: string;
  certainty: string;
  businessContent: string;
  businessLevel: number;
  workloadLevel: number;
  judgmentLevel: number;
  totalBudget: number | null;
  departmentBudget: number | null;
  optionalAmount: number | null;
  proposalDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  note: string | null;
  proposalStatus: string | null;
  proposalEffortType: string | null;
  projectStatus: string | null;
  statusUpdatedAt: string | null;
  assignees: { businessLevel: number; workloadLevel: number; judgmentLevel: number; user: { id: string; name: string; department: string } }[];
};
type FormState = Partial<Project> & {
  note?: string | null;
  assigneeIds?: string[];
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [project, setProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({});
  const [users, setUsers] = useState<{ id: string; name: string; department: string }[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [assigneesTouched, setAssigneesTouched] = useState(false);
  const [assigneeLoadLevels, setAssigneeLoadLevels] = useState<
    Record<string, { businessLevel: number; workloadLevel: number; judgmentLevel: number }>
  >({});
  const [loadLevelsTouched, setLoadLevelsTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setAssigneeLoadLevels(
          Object.fromEntries(
            (data.assignees ?? []).map((a: { businessLevel: number; workloadLevel: number; judgmentLevel: number; user: { id: string } }) => [
              a.user.id,
              { businessLevel: a.businessLevel, workloadLevel: a.workloadLevel, judgmentLevel: a.judgmentLevel },
            ])
          )
        );
        setForm({
          status: data.status,
          certainty: data.certainty,
          ownerDepartment: data.ownerDepartment,
          businessLevel: data.businessLevel,
          workloadLevel: data.workloadLevel,
          judgmentLevel: data.judgmentLevel,
          assigneeIds: data.assignees?.map((a: { user: { id: string } }) => a.user.id) ?? [],
          totalBudget: data.totalBudget,
          departmentBudget: data.departmentBudget,
          optionalAmount: data.optionalAmount,
          periodStart: data.periodStart ? data.periodStart.slice(0, 7) : "",
          periodEnd: data.periodEnd ? data.periodEnd.slice(0, 7) : "",
          note: data.note,
          businessContent: data.businessContent,
          proposalStatus: data.proposalStatus ?? "preparing",
          proposalEffortType: data.proposalEffortType ?? "existing_continuation",
          projectStatus: data.projectStatus ?? "preparing",
        });
      })
      .catch(() => setProject(null));
  }, [id]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => setSessionUserId(null));
  }, []);

  useEffect(() => {
    if (sessionUserId) {
      setForm((f) => {
        const current = (f as { assigneeIds?: string[] }).assigneeIds ?? [];
        if (current.includes(sessionUserId)) return f;
        return { ...f, assigneeIds: Array.from(new Set([...current, sessionUserId])) };
      });
    }
  }, [sessionUserId]);

  function targetTab(status?: string) {
    return status === "good" ? "decided" : "proposal";
  }

  function validateBudget(): string {
    const total = form.totalBudget ? Number(form.totalBudget) : null;
    const dept = form.departmentBudget ? Number(form.departmentBudget) : null;
    if (total !== null && dept !== null && dept > total) {
      return "部門予算は全体予算以下にしてください";
    }
    return "";
  }

  function handleSave() {
    if (form.status === "good" && !form.departmentBudget) {
      alert("決定案件には部門予算を入力してください");
      return;
    }
    const budgetError = validateBudget();
    if (budgetError) {
      alert(budgetError);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      ...form,
      periodStart: form.periodStart ? `${form.periodStart}-01` : null,
      periodEnd: form.periodEnd ? `${form.periodEnd}-01` : null,
    };
    if (!assigneesTouched) {
      delete payload.assigneeIds;
    }
    if (loadLevelsTouched && form.status === "good") {
      payload.assigneeLoadLevels = assigneeLoadLevels;
    }
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const contentType = r.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await r.json()
          : { error: (await r.text()) || "更新に失敗しました" };
        if (!r.ok) throw new Error(data.error || "更新に失敗しました");
        return data;
      })
      .then((data) => {
        if (data.id) {
          setProject(data);
          setAssigneeLoadLevels(
            Object.fromEntries(
              (data.assignees ?? []).map((a: { businessLevel: number; workloadLevel: number; judgmentLevel: number; user: { id: string } }) => [
                a.user.id,
                { businessLevel: a.businessLevel, workloadLevel: a.workloadLevel, judgmentLevel: a.judgmentLevel },
              ])
            )
          );
          setLoadLevelsTouched(false);
          setForm({
            status: data.status,
            certainty: data.certainty,
            ownerDepartment: data.ownerDepartment,
            businessLevel: data.businessLevel,
            workloadLevel: data.workloadLevel,
            judgmentLevel: data.judgmentLevel,
            assigneeIds: data.assignees?.map((a: { user: { id: string } }) => a.user.id) ?? [],
            totalBudget: data.totalBudget,
            departmentBudget: data.departmentBudget,
            optionalAmount: data.optionalAmount,
            periodStart: data.periodStart ? data.periodStart.slice(0, 7) : "",
            periodEnd: data.periodEnd ? data.periodEnd.slice(0, 7) : "",
            note: data.note,
            proposalStatus: data.proposalStatus ?? "preparing",
            proposalEffortType: data.proposalEffortType ?? "existing_continuation",
            projectStatus: data.projectStatus ?? "preparing",
          });
          setSavedMessage("更新しました");
          setTimeout(() => {
            router.push(`/admin?tab=${targetTab(data.status)}`);
            router.refresh();
          }, 400);
        }
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "更新に失敗しました";
        alert(message);
      })
      .finally(() => setSaving(false));
  }

  if (!project) return <p className="p-4 text-stone-500">読み込み中…</p>;

  const load = project.status === "bad"
    ? 0
    : project.status === "good"
      ? (project.assignees.length > 0
          ? project.assignees.reduce((sum, a) => sum + projectLoadScore(a.businessLevel, a.workloadLevel, a.judgmentLevel), 0) / project.assignees.length
          : projectLoadScore(project.businessLevel, project.workloadLevel, project.judgmentLevel))
      : (PROPOSAL_EFFORT_WEIGHTS[(project.proposalEffortType ?? "existing_continuation") as ProposalEffortType] ?? PROPOSAL_EFFORT_WEIGHTS.existing_continuation) / Math.max(project.assignees.length, 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-amber-700 hover:underline">← 管理者案件一覧</Link>
      </div>
      <h1 className="text-xl font-bold text-stone-800">{project.name}</h1>

      <div className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <dt className="text-stone-500">クライアント</dt>
          <dd>{project.client.name}</dd>
          <dt className="text-stone-500">案件種別</dt>
          <dd>{project.projectType}</dd>
          <dt className="text-stone-500">業務内容</dt>
          <dd>
            <select
              value={form.businessContent ?? project.businessContent}
              onChange={(e) => setForm((f) => ({ ...f, businessContent: e.target.value }))}
              className="rounded border border-stone-300 px-2 py-1 text-sm"
            >
              {BUSINESS_CONTENTS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </dd>
          <dt className="text-stone-500">負荷スコア</dt>
          <dd>{load.toFixed(1)}</dd>
        </dl>

        <hr className="my-4 border-stone-200" />

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Good / Bad / 未定</label>
            <select
              value={form.status ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
            >
              <option value="undecided">未定</option>
              <option value="good">Good（決定）</option>
              <option value="bad">Bad</option>
            </select>
          </div>
          <div>
            {form.status === "good" ? (
              <>
                <label className="mb-1 block text-sm font-medium text-stone-700">決定案件ステータス *</label>
                <select
                  value={form.projectStatus ?? "preparing"}
                  onChange={(e) => setForm((f) => ({ ...f, projectStatus: e.target.value }))}
                  className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
                  required
                >
                  {PROJECT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium text-stone-700">提案案件ステータス *</label>
                <select
                  value={form.proposalStatus ?? "preparing"}
                  onChange={(e) => setForm((f) => ({ ...f, proposalStatus: e.target.value }))}
                  className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
                  required
                >
                  {PROPOSAL_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <label className="mb-1 mt-3 block text-sm font-medium text-stone-700">提案タイプ *</label>
                <select
                  value={form.proposalEffortType ?? "existing_continuation"}
                  onChange={(e) => setForm((f) => ({ ...f, proposalEffortType: e.target.value }))}
                  className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
                  required
                >
                  {PROPOSAL_EFFORT_TYPES.map((t) => (
                    <option key={t} value={t}>{PROPOSAL_EFFORT_LABELS[t]}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">確度</label>
            <select
              value={form.certainty ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, certainty: e.target.value }))}
              className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
            >
              {CERTAINTY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">売上責任部署</label>
            <select
              value={form.ownerDepartment ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, ownerDepartment: e.target.value }))}
              className="w-full max-w-xs rounded border border-stone-300 px-3 py-2"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">担当者</label>
            <div className="rounded border border-stone-300 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {users.map((u) => {
                  const ids = (form as { assigneeIds?: string[] }).assigneeIds ?? [];
                  const checked = ids.includes(u.id);
                  const isSelf = sessionUserId === u.id;
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSelf}
                        onChange={(e) => {
                          setAssigneesTouched(true);
                          setForm((f) => {
                            const current = new Set((f as { assigneeIds?: string[] }).assigneeIds ?? []);
                            if (e.target.checked) current.add(u.id);
                            else current.delete(u.id);
                            return { ...f, assigneeIds: Array.from(current) };
                          });
                        }}
                      />
                      <span>{u.department} / {u.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-xs text-stone-500">自分は固定で担当者に含まれます（外せません）。</p>
          </div>
          {form.status === "good" && ((form as { assigneeIds?: string[] }).assigneeIds ?? []).length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">担当者別 負荷レベル(1-5)</label>
              <div className="space-y-2 rounded border border-stone-300 bg-white p-3">
                <div className="hidden sm:grid sm:grid-cols-4 gap-2 text-xs text-stone-500 px-1">
                  <span>担当者</span><span>業務レベル</span><span>稼働負荷</span><span>判断負荷</span>
                </div>
                {((form as { assigneeIds?: string[] }).assigneeIds ?? []).map((uid) => {
                  const user = users.find((u) => u.id === uid);
                  if (!user) return null;
                  const levels = assigneeLoadLevels[uid] ?? {
                    businessLevel: form.businessLevel ?? 3,
                    workloadLevel: form.workloadLevel ?? 3,
                    judgmentLevel: form.judgmentLevel ?? 3,
                  };
                  const updateLevel = (field: string, value: number) => {
                    setLoadLevelsTouched(true);
                    setAssigneeLoadLevels((prev) => ({
                      ...prev,
                      [uid]: { ...levels, [field]: value },
                    }));
                  };
                  return (
                    <div key={uid} className="grid gap-2 sm:grid-cols-4 items-center">
                      <span className="text-sm font-medium text-stone-700 truncate">{user.department} / {user.name}</span>
                      <select value={levels.businessLevel} onChange={(e) => updateLevel("businessLevel", Number(e.target.value))} className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm">
                        {LOAD_LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select value={levels.workloadLevel} onChange={(e) => updateLevel("workloadLevel", Number(e.target.value))} className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm">
                        {LOAD_LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select value={levels.judgmentLevel} onChange={(e) => updateLevel("judgmentLevel", Number(e.target.value))} className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm">
                        {LOAD_LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-stone-500">担当者ごとに業務レベル / 稼働負荷 / 判断負荷を個別に設定できます。</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-stone-600">全体予算</label>
              <input
                type="number"
                value={form.totalBudget ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, totalBudget: e.target.value ? Number(e.target.value) : null }))}
                className="no-spinner w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">
                部門予算
                {form.status === "good" && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                type="number"
                value={form.departmentBudget ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, departmentBudget: e.target.value ? Number(e.target.value) : null }))}
                className={`no-spinner w-full rounded border px-3 py-2 ${
                  form.status === "good" && !form.departmentBudget
                    ? "border-red-400 bg-red-50"
                    : "border-stone-300"
                }`}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">任意額</label>
              <input
                type="number"
                value={form.optionalAmount ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, optionalAmount: e.target.value ? Number(e.target.value) : null }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>
          {(() => {
            const total = form.totalBudget ? Number(form.totalBudget) : null;
            const dept = form.departmentBudget ? Number(form.departmentBudget) : null;
            if (form.status === "good" && dept === null) {
              return <p className="rounded bg-red-50 p-2 text-sm text-red-700">決定案件には部門予算を入力してください</p>;
            }
            if (total !== null && dept !== null && dept > total) {
              return <p className="rounded bg-amber-50 p-2 text-sm text-amber-700">部門予算は全体予算以下にしてください</p>;
            }
            return null;
          })()}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-stone-600">実施開始</label>
              <input
                type="month"
                value={form.periodStart ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">実施終了</label>
              <input
                type="month"
                value={form.periodEnd ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-stone-600">備考</label>
            <textarea
              value={form.note ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={3}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {savedMessage && (
            <span className="self-center text-sm text-emerald-600">{savedMessage}</span>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!confirm("この案件を削除しますか？")) return;
              const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
              const data = await res.json();
              if (!res.ok) {
                alert(data.error || "削除に失敗しました");
                return;
              }
              router.push(`/admin?tab=${targetTab(form.status)}`);
              router.refresh();
            }}
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
    </div>
  );
}
