"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_TYPES,
  CERTAINTY_OPTIONS,
  BUSINESS_CONTENTS,
  DEPARTMENTS,
  LOAD_LEVELS,
  PROPOSAL_STATUS_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROPOSAL_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  PROPOSAL_EFFORT_TYPES,
  PROPOSAL_EFFORT_LABELS,
} from "@/lib/constants";

type Client = { id: string; name: string };
type User = { id: string; name: string; department: string; role: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assigneeLoadLevels, setAssigneeLoadLevels] = useState<
    Record<string, { businessLevel: number; workloadLevel: number; judgmentLevel: number }>
  >({});
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    projectType: "自主提案",
    certainty: "B(50%)",
    businessContent: "",
    ownerDepartment: "",
    assigneeIds: [] as string[],
    businessLevel: 3,
    workloadLevel: 3,
    judgmentLevel: 3,
    totalBudget: "",
    departmentBudget: "",
    optionalAmount: "",
    proposalDate: "",
    periodStart: "",
    periodEnd: "",
    note: "",
    status: "undecided",
    proposalStatus: "preparing",
    projectStatus: "preparing",
    proposalEffortType: "existing_continuation",
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((list) => setClients(Array.isArray(list) ? list : []))
      .catch(() => setClients([]));
  }, []);

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
    if (sessionUserId && !form.assigneeIds.includes(sessionUserId)) {
      setForm((f) => ({ ...f, assigneeIds: Array.from(new Set([...f.assigneeIds, sessionUserId])) }));
    }
  }, [sessionUserId]);

  useEffect(() => {
    if (form.projectType === "AE提案") setForm((f) => ({ ...f, certainty: "A(70%)" }));
    if (form.projectType === "競合コンペ") setForm((f) => ({ ...f, certainty: "C(30%)" }));
  }, [form.projectType]);

  function validateBudget(): string {
    const total = form.totalBudget ? Number(form.totalBudget) : null;
    const dept = form.departmentBudget ? Number(form.departmentBudget) : null;
    if (total !== null && dept !== null && dept > total) {
      return "部門予算は全体予算以下にしてください";
    }
    return "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.status === "good" && !form.departmentBudget) {
      setError("決定案件には部門予算を入力してください");
      return;
    }
    const budgetError = validateBudget();
    if (budgetError) {
      setError(budgetError);
      return;
    }
    setLoading(true);
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        assigneeLoadLevels: form.status === "good" ? assigneeLoadLevels : undefined,
        totalBudget: form.totalBudget ? Number(form.totalBudget) : null,
        departmentBudget: form.departmentBudget ? Number(form.departmentBudget) : null,
        optionalAmount: form.optionalAmount ? Number(form.optionalAmount) : null,
        proposalDate: form.proposalDate || null,
        periodStart: form.periodStart ? `${form.periodStart}-01` : null,
        periodEnd: form.periodEnd ? `${form.periodEnd}-01` : null,
        proposalStatus: form.status === "good" ? null : form.proposalStatus,
        projectStatus: form.status === "good" ? form.projectStatus : null,
        proposalEffortType: form.status === "good" ? null : form.proposalEffortType,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "登録に失敗しました");
        return data;
      })
      .then(() => {
        router.push("/mypage");
        router.refresh();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }

  const r = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <button
          type="button"
          onClick={() => router.push("/mypage")}
          className="text-sm text-amber-700 hover:underline"
        >
          ← マイページへ戻る
        </button>
      </p>
      <h1 className="mb-6 text-xl font-bold text-stone-800">新規案件入力</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded border border-stone-200 bg-white p-6 shadow-sm">
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">クライアント名 *</label>
            <select {...r("clientId")} required className="w-full rounded border border-stone-300 px-3 py-2">
              <option value="">選択</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">案件名 *</label>
            <input type="text" {...r("name")} required className="w-full rounded border border-stone-300 px-3 py-2" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Good / Bad / 未定</label>
            <select {...r("status")} className="w-full rounded border border-stone-300 px-3 py-2">
              <option value="undecided">未定</option>
              <option value="good">Good（決定）</option>
              <option value="bad">Bad</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">案件種別</label>
            <select {...r("projectType")} className="w-full rounded border border-stone-300 px-3 py-2">
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">案件確度</label>
            <select {...r("certainty")} className="w-full rounded border border-stone-300 px-3 py-2">
              {CERTAINTY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          {form.status === "good" ? (
            <>
              <label className="mb-1 block text-sm font-medium text-stone-700">決定案件ステータス *</label>
              <select {...r("projectStatus")} required className="w-full rounded border border-stone-300 px-3 py-2">
                {PROJECT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-stone-700">提案案件ステータス *</label>
              <select {...r("proposalStatus")} required className="w-full rounded border border-stone-300 px-3 py-2">
                {PROPOSAL_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <label className="mb-1 mt-3 block text-sm font-medium text-stone-700">提案タイプ *</label>
              <select {...r("proposalEffortType")} required className="w-full rounded border border-stone-300 px-3 py-2">
                {PROPOSAL_EFFORT_TYPES.map((t) => (
                  <option key={t} value={t}>{PROPOSAL_EFFORT_LABELS[t]}</option>
                ))}
              </select>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">売上責任部署 *</label>
          <select {...r("ownerDepartment")} required className="w-full rounded border border-stone-300 px-3 py-2">
            <option value="">選択</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">担当者 *</label>
          <div className="rounded border border-stone-300 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {users.map((u) => {
                const isSelf = sessionUserId === u.id;
                return (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.assigneeIds.includes(u.id)}
                    disabled={isSelf}
                    onChange={(e) => {
                      setForm((f) => {
                        const next = new Set(f.assigneeIds);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        return { ...f, assigneeIds: Array.from(next) };
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

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">業務内容 *</label>
          <select {...r("businessContent")} required className="w-full rounded border border-stone-300 px-3 py-2">
            <option value="">選択</option>
            {BUSINESS_CONTENTS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {form.status === "good" && form.assigneeIds.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">担当者別 負荷レベル(1-5) *</label>
            <div className="space-y-2 rounded border border-stone-300 bg-white p-3">
              <div className="hidden sm:grid sm:grid-cols-4 gap-2 text-xs text-stone-500 px-1">
                <span>担当者</span><span>業務レベル</span><span>稼働負荷</span><span>判断負荷</span>
              </div>
              {form.assigneeIds.map((uid) => {
                const user = users.find((u) => u.id === uid);
                if (!user) return null;
                const levels = assigneeLoadLevels[uid] ?? {
                  businessLevel: form.businessLevel,
                  workloadLevel: form.workloadLevel,
                  judgmentLevel: form.judgmentLevel,
                };
                const updateLevel = (field: string, value: number) => {
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">全体予算</label>
            <input type="number" {...r("totalBudget")} className="no-spinner w-full rounded border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              部門予算
              {form.status === "good" && <span className="ml-1 text-red-500">*</span>}
            </label>
            <input
              type="number"
              {...r("departmentBudget")}
              className={`no-spinner w-full rounded border px-3 py-2 ${
                form.status === "good" && !form.departmentBudget
                  ? "border-red-400 bg-red-50"
                  : "border-stone-300"
              }`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">任意額</label>
            <input type="number" {...r("optionalAmount")} className="w-full rounded border border-stone-300 px-3 py-2" />
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">提案日</label>
            <input type="date" {...r("proposalDate")} className="w-full rounded border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">実施開始</label>
            <input type="month" {...r("periodStart")} className="w-full rounded border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">実施終了</label>
            <input type="month" {...r("periodEnd")} className="w-full rounded border border-stone-300 px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">備考</label>
          <textarea {...r("note")} rows={3} className="w-full rounded border border-stone-300 px-3 py-2" />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "登録中…" : "登録"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
