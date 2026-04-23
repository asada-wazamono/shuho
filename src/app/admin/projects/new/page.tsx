"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PROJECT_TYPES,
  CERTAINTY_OPTIONS,
  BUSINESS_CONTENTS,
  DEPARTMENTS,
  PROPOSAL_STATUS_OPTIONS,
  PROPOSAL_STATUS_LABELS,
  INVOLVEMENT_OPTIONS,
  INVOLVEMENT_LABELS,
  type Involvement,
} from "@/lib/constants";

type Client = { id: string; name: string };
type User = { id: string; name: string; department: string; role: string };

export default function AdminNewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fromModal = useRef(false);

  type AssigneeEntry = { userId: string; involvement: Involvement };
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    projectType: "AE提案",
    competitorSituation: "",
    certainty: "A(70%)",
    businessContent: "",
    ownerDepartment: "",
    assignees: [] as AssigneeEntry[],
    totalBudget: "",
    proposalDate: "",
    periodStart: "",
    note: "",
    proposalStatus: "preparing",
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((list) => setClients(Array.isArray(list) ? list : []))
      .catch(() => setClients([]));
    fetch("/api/users")
      .then((r) => r.json())
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  // URL の ?clientId= からクライアントを自動選択
  useEffect(() => {
    const urlClientId = searchParams.get("clientId");
    if (urlClientId) {
      fromModal.current = true;
      setForm((f) => ({ ...f, clientId: urlClientId }));
    }
  }, [searchParams]);

  // 案件種別変更時に確度を自動設定
  useEffect(() => {
    if (form.projectType === "AE提案") setForm((f) => ({ ...f, certainty: "A(70%)" }));
    if (form.projectType === "競合コンペ") setForm((f) => ({ ...f, certainty: "C(30%)" }));
    if (form.projectType === "自主提案") setForm((f) => ({ ...f, certainty: "B(50%)" }));
  }, [form.projectType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.totalBudget) {
      setError("全体予算は必須です");
      return;
    }
    setLoading(true);
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        assignees: form.assignees,
        totalBudget: Number(form.totalBudget),
        proposalDate: form.proposalDate || null,
        periodStart: form.periodStart
          ? (form.periodStart.length === 7 ? `${form.periodStart}-01` : form.periodStart)
          : null,
        competitorSituation: form.projectType === "競合コンペ" ? form.competitorSituation : null,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "登録に失敗しました");
        return data;
      })
      .then(() => {
        router.push("/admin");
        router.refresh();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }

  const r = (name: keyof typeof form) => ({
    value: form[name] as string,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm text-amber-700 hover:underline"
        >
          ← 管理画面へ戻る
        </button>
      </p>
      <h1 className="mb-6 text-xl font-bold text-stone-800">新規案件入力</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded border border-stone-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">クライアント名 *</label>
            <select
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              required
              className="w-full rounded border border-stone-300 px-3 py-2"
            >
              <option value="">選択</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">案件名 *</label>
            <input
              type="text"
              {...r("name")}
              required
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">案件種別 *</label>
            <select {...r("projectType")} className="w-full rounded border border-stone-300 px-3 py-2">
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              案件確度<span className="ml-1 text-xs text-stone-400">（案件種別で自動設定）</span>
            </label>
            <select {...r("certainty")} className="w-full rounded border border-stone-300 px-3 py-2">
              {CERTAINTY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {form.projectType === "競合コンペ" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">コンペ状況</label>
            <input
              type="text"
              {...r("competitorSituation")}
              placeholder="何社？入札？など"
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">提案案件ステータス *</label>
          <select {...r("proposalStatus")} required className="w-full rounded border border-stone-300 px-3 py-2">
            {PROPOSAL_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">メイン担当部署 *</label>
          <select {...r("ownerDepartment")} required className="w-full rounded border border-stone-300 px-3 py-2">
            <option value="">選択</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* 担当者（追加型・関わり度あり） */}
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">担当者</label>
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
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        assignees: f.assignees.map((x) =>
                          x.userId === u.id ? { ...x, involvement: e.target.value as Involvement } : x
                        ),
                      }))}
                      className="rounded border border-stone-300 px-2 py-0.5 text-xs"
                    >
                      {INVOLVEMENT_OPTIONS.map((inv) => (
                        <option key={inv} value={inv}>{INVOLVEMENT_LABELS[inv]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      assignees: f.assignees.filter((x) => x.userId !== u.id),
                    }))}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </div>
              );
            })}
            {users.filter((u) => !form.assignees.some((a) => a.userId === u.id)).length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const uid = e.target.value;
                  if (uid) {
                    setForm((f) => ({
                      ...f,
                      assignees: [...f.assignees, { userId: uid, involvement: "SUB" as Involvement }],
                    }));
                    e.currentTarget.value = "";
                  }
                }}
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
          <p className="mt-1 text-xs text-stone-500">関わり度：高=メイン、中=サブ、低=アドバイス</p>
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

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">全体予算 *</label>
          <input
            type="number"
            {...r("totalBudget")}
            required
            placeholder="例：5000000"
            className="no-spinner w-full max-w-xs rounded border border-stone-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              提案日<span className="ml-1 text-red-500">*</span>
            </label>
            <input
              type="date"
              {...r("proposalDate")}
              required
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              実施想定日<span className="ml-1 text-xs text-stone-400">（日不明時は1日）</span>
            </label>
            <input
              type="date"
              {...r("periodStart")}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">備考</label>
          <textarea
            {...r("note")}
            rows={3}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
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
            onClick={() => router.push("/admin")}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
