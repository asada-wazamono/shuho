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
type ExistingProject = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  assignees: { user: { id: string; name: string } }[];
  subProjects: { id: string; name: string; status: string }[];
};

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionDept, setSessionDept] = useState<string>("");
  const [sessionRole, setSessionRole] = useState<string>("");
  const isFromAdmin = searchParams.get("from") === "admin";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // URL から来た場合はモーダルを出さないフラグ
  const fromModal = useRef(false);

  // クライアント選択時の既存案件モーダル
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([]);
  const [showExistingModal, setShowExistingModal] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

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
    periodStart: "",  // 年月日で入力（日不明時は1日）
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
      .then((data) => {
        setSessionUserId(data?.user?.id ?? null);
        setSessionDept(data?.user?.department ?? "");
        setSessionRole(data?.user?.role ?? "");
      })
      .catch(() => {});
  }, []);

  // セッションが取れたら自分を担当者に追加、部署を自動設定
  useEffect(() => {
    if (!sessionUserId) return;
    setForm((f) => ({
      ...f,
      assignees: f.assignees.some((a) => a.userId === sessionUserId)
        ? f.assignees
        : [...f.assignees, { userId: sessionUserId, involvement: "SUB" as Involvement }],
      ownerDepartment: f.ownerDepartment || sessionDept,
    }));
  }, [sessionUserId, sessionDept]);

  // URL の ?clientId= からクライアントを自動選択（モーダルは出さない）
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

  // クライアント選択時：既存案件を取得してモーダル表示
  // ただし URL から clientId が来た場合（fromModal=true）は出さない
  async function handleClientChange(clientId: string) {
    setForm((f) => ({ ...f, clientId }));
    if (!clientId) return;
    if (fromModal.current) {
      fromModal.current = false;
      return;
    }
    try {
      const res = await fetch(`/api/projects?clientId=${clientId}`);
      const data: ExistingProject[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setExistingProjects(data);
        setShowExistingModal(true);
      }
    } catch {
      // 取得失敗時はモーダルを表示しない
    }
  }

  // 既存案件に参加
  async function handleJoin(projectId: string) {
    setJoiningId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/join`, { method: "POST" });
      if (res.ok) {
        setShowExistingModal(false);
        router.push(isFromAdmin ? "/admin" : "/mypage");
        router.refresh();
      }
    } catch {
      setJoiningId(null);
    }
  }

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
        // 日付が入力されていれば使用。入力が年月のみの場合は1日を補完
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
        router.push(isFromAdmin ? "/admin" : "/mypage");
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
          onClick={() => router.push(isFromAdmin ? "/admin" : "/mypage")}
          className="text-sm text-amber-700 hover:underline"
        >
          {isFromAdmin ? "← 管理画面へ戻る" : "← マイページへ戻る"}
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
            <label className="mb-1 block text-sm font-medium text-stone-700">
              クライアント名 *
            </label>
            <select
              value={form.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
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
            <label className="mb-1 block text-sm font-medium text-stone-700">
              案件名 *
            </label>
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
            <label className="mb-1 block text-sm font-medium text-stone-700">
              案件種別 *
            </label>
            <select {...r("projectType")} className="w-full rounded border border-stone-300 px-3 py-2">
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              案件確度
              <span className="ml-1 text-xs text-stone-400">（案件種別で自動設定）</span>
            </label>
            <select {...r("certainty")} className="w-full rounded border border-stone-300 px-3 py-2">
              {CERTAINTY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 競合コンペ時のコンペ状況入力 */}
        {form.projectType === "競合コンペ" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              コンペ状況
            </label>
            <input
              type="text"
              {...r("competitorSituation")}
              placeholder="何社？入札？など"
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            提案案件ステータス *
          </label>
          <select {...r("proposalStatus")} required className="w-full rounded border border-stone-300 px-3 py-2">
            {PROPOSAL_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            メイン担当部署 *
          </label>
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
            <div className="space-y-2">
              {users.map((u) => {
                const isSelf = sessionUserId === u.id;
                const entry = form.assignees.find((a) => a.userId === u.id);
                const checked = !!entry;
                return (
                  <div key={u.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSelf && !isFromAdmin}
                      onChange={(e) => {
                        setForm((f) => {
                          if (e.target.checked) {
                            let newAssignees = [...f.assignees, { userId: u.id, involvement: "SUB" as Involvement }];
                            // 管理者セッション：非admin担当者が追加されたら管理者を自動で外す
                            if (sessionRole === "admin" && sessionUserId && u.id !== sessionUserId) {
                              newAssignees = newAssignees.filter((a) => a.userId !== sessionUserId);
                            }
                            return { ...f, assignees: newAssignees };
                          } else {
                            const newAssignees = f.assignees.filter((a) => a.userId !== u.id);
                            // 管理者セッション：非admin担当者が全員外れたら管理者を自動で戻す
                            if (sessionRole === "admin" && sessionUserId) {
                              const hasNonAdmin = newAssignees.some((a) => {
                                const usr = users.find((us) => us.id === a.userId);
                                return usr?.role !== "admin";
                              });
                              if (!hasNonAdmin) {
                                newAssignees.push({ userId: sessionUserId, involvement: "MAIN" as Involvement });
                              }
                            }
                            return { ...f, assignees: newAssignees };
                          }
                        });
                      }}
                    />
                    <span className="w-36 shrink-0">{u.department} / {u.name}</span>
                    {checked && (
                      <label className="flex items-center gap-1 text-xs text-stone-500">
                        関わり度：
                        <select
                          value={entry.involvement}
                          onChange={(e) => {
                            setForm((f) => ({
                              ...f,
                              assignees: f.assignees.map((a) =>
                                a.userId === u.id ? { ...a, involvement: e.target.value as Involvement } : a
                              ),
                            }));
                          }}
                          className="rounded border border-stone-300 px-2 py-0.5 text-xs"
                        >
                          {INVOLVEMENT_OPTIONS.map((inv) => (
                            <option key={inv} value={inv}>{INVOLVEMENT_LABELS[inv]}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {isFromAdmin
              ? "担当者を選ぶと管理者が自動で外れます。全員外すと管理者に戻ります。関わり度：高=メイン、中=サブ、低=アドバイス"
              : "自分は固定で担当者に含まれます（外せません）。関わり度：高=メイン、中=サブ、低=アドバイス"}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            業務内容 *
          </label>
          <select {...r("businessContent")} required className="w-full rounded border border-stone-300 px-3 py-2">
            <option value="">選択</option>
            {BUSINESS_CONTENTS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              全体予算 *
            </label>
            <input
              type="number"
              {...r("totalBudget")}
              required
              placeholder="例：5000000"
              className="no-spinner w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
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
              実施想定日
              <span className="ml-1 text-xs text-stone-400">（日不明時は1日）</span>
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
            onClick={() => router.back()}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            キャンセル
          </button>
        </div>
      </form>

      {/* 既存案件確認モーダル */}
      {showExistingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-stone-200 px-6 py-4">
              <h2 className="text-lg font-bold text-stone-800">
                このクライアントの既存案件
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                参加したい案件があれば「参加する」を押してください。
                ない場合は「新規登録へ進む」を選んでください。
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto px-6 py-4">
              {existingProjects.map((p) => (
                <div
                  key={p.id}
                  className="mb-3 rounded border border-stone-200 p-3 last:mb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-800 truncate">{p.name}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        担当者：{p.assignees.map((a) => a.user.name).join("・")}
                      </p>
                      {p.subProjects.length > 0 && (
                        <p className="mt-0.5 text-xs text-stone-400">
                          子案件：{p.subProjects.map((s) => s.name).join("・")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoin(p.id)}
                      disabled={joiningId === p.id}
                      className="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {joiningId === p.id ? "参加中…" : "参加する"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-stone-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowExistingModal(false)}
                className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                新規登録へ進む
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
