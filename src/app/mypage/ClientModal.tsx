"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  INVOLVEMENT_OPTIONS,
  INVOLVEMENT_LABELS,
  EXECUTION_STATUS_LABELS,
  SUB_PROJECT_STATUS_LABELS,
  type Involvement,
  type ExecutionStatus,
  type SubProjectStatus,
} from "@/lib/constants";

type SubProjectAssignee = {
  userId: string;
  involvement: string;
  skillLevel: number;
  user: { id: string; name: string };
};
type SubProject = {
  id: string;
  name: string;
  status: string;
  departmentBudget: number | null;
  assignees: SubProjectAssignee[];
};
type Project = {
  id: string;
  name: string;
  status: string;
  projectStatus: string | null;
  assignees: { user: { id: string; name: string } }[];
  subProjects: SubProject[];
};

type JoinEntry = {
  subProjectId: string;
  involvement: Involvement;
};

type Props = {
  clientId: string;
  clientName: string;
  sessionUserId: string | null;
  adminMode?: boolean;
  onClose: () => void;
};

export function ClientModal({ clientId, clientName, sessionUserId, adminMode = false, onClose }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinEntry, setJoinEntry] = useState<JoinEntry | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetch(`/api/projects?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  async function handleJoin(sp: SubProject) {
    if (!joinEntry || joinEntry.subProjectId !== sp.id) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/subprojects/${sp.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          involvement: joinEntry.involvement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "参加に失敗しました");

      setJoinedIds((prev) => new Set(Array.from(prev).concat(sp.id)));
      setJoinEntry(null);
      setSuccessMsg(`「${sp.name}」に参加しました`);
      setTimeout(() => setSuccessMsg(""), 3000);

      // 最新状態に更新
      const refreshed = await fetch(`/api/projects?clientId=${clientId}`).then((r) => r.json());
      if (Array.isArray(refreshed)) setProjects(refreshed);
    } catch (e) {
      alert(e instanceof Error ? e.message : "参加に失敗しました");
    } finally {
      setJoining(false);
    }
  }

  function isAssigned(sp: SubProject) {
    return (
      joinedIds.has(sp.id) ||
      (sessionUserId != null && sp.assignees.some((a) => a.userId === sessionUserId))
    );
  }

  function parentStatusBadge(p: Project) {
    if (p.status === "good") {
      const label = EXECUTION_STATUS_LABELS[p.projectStatus as ExecutionStatus] ?? "進行中";
      const cls =
        p.projectStatus === "suspended"
          ? "bg-red-100 text-red-600"
          : "bg-emerald-100 text-emerald-700";
      return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
    }
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
        提案中
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-800">{clientName}</h2>
            <p className="text-xs text-stone-400">案件・プロジェクト一覧</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-stone-400">読み込み中…</p>
          ) : (
            <>
              {successMsg && (
                <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  ✓ {successMsg}
                </p>
              )}

              {projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 py-8 text-center">
                  <p className="text-sm text-stone-400">
                    このクライアントの進行中案件はありません
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    「新規案件を作る」から最初の案件を登録しましょう
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-stone-200 bg-white"
                    >
                      {/* 親案件ヘッダー */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Link
                            href={adminMode ? `/admin/projects/${p.id}` : `/mypage/projects/${p.id}`}
                            onClick={onClose}
                            className="font-medium text-stone-800 hover:text-amber-700 hover:underline"
                          >
                            {p.name}
                          </Link>
                          {parentStatusBadge(p)}
                        </div>
                        {/* Good案件にのみ「子案件を追加」ボタン */}
                        {p.status === "good" && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              if (adminMode) {
                                router.push(`/admin/projects/${p.id}/subprojects/new`);
                              } else {
                                router.push(`/mypage/projects/${p.id}/subprojects/new`);
                              }
                            }}
                            className="shrink-0 rounded border border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            ＋ 子案件を追加
                          </button>
                        )}
                      </div>

                      {/* 親案件の担当者 */}
                      <div className="px-4 py-2">
                        <p className="text-xs text-stone-400">
                          担当：{p.assignees.length > 0
                            ? p.assignees.map((a) => a.user.name).join("・")
                            : "未設定"}
                        </p>
                      </div>

                      {/* 子案件リスト */}
                      {p.subProjects.length > 0 ? (
                        <div className="border-t border-stone-100 divide-y divide-stone-50">
                          {p.subProjects.map((sp) => {
                            const assigned = isAssigned(sp);
                            const isExpanded =
                              joinEntry?.subProjectId === sp.id;

                            return (
                              <div key={sp.id} className="px-4 py-2.5">
                                {/* 子案件の基本情報行 */}
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                                      <span className="text-stone-300 text-xs">↳</span>
                                      <Link
                                        href={adminMode ? `/admin/subprojects/${sp.id}` : `/mypage/subprojects/${sp.id}`}
                                        onClick={onClose}
                                        className="font-medium text-stone-700 hover:text-amber-700 hover:underline"
                                      >
                                        {sp.name}
                                      </Link>
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-xs ${
                                          sp.status === "completed"
                                            ? "bg-stone-100 text-stone-400"
                                            : "bg-emerald-50 text-emerald-600"
                                        }`}
                                      >
                                        {SUB_PROJECT_STATUS_LABELS[
                                          sp.status as SubProjectStatus
                                        ] ?? sp.status}
                                      </span>
                                      {sp.departmentBudget != null && (
                                        <span className="text-xs text-stone-400">
                                          ¥{sp.departmentBudget.toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                    {sp.assignees.length > 0 && (
                                      <p className="mt-0.5 pl-4 text-xs text-stone-400">
                                        {sp.assignees
                                          .map(
                                            (a) =>
                                              `${a.user.name}（${INVOLVEMENT_LABELS[a.involvement as Involvement] ?? a.involvement}）`
                                          )
                                          .join("・")}
                                      </p>
                                    )}
                                  </div>

                                  {/* 参加ボタン or 参加中バッジ */}
                                  {assigned ? (
                                    <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                                      参加中
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isExpanded) {
                                          setJoinEntry(null);
                                        } else {
                                          setJoinEntry({
                                            subProjectId: sp.id,
                                            involvement: "SUB",
                                          });
                                        }
                                      }}
                                      className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                                        isExpanded
                                          ? "border-stone-300 text-stone-500"
                                          : "border-amber-400 text-amber-700 hover:bg-amber-50"
                                      }`}
                                    >
                                      {isExpanded ? "取消" : "参加する"}
                                    </button>
                                  )}
                                </div>

                                {/* 参加フォーム（インライン展開） */}
                                {isExpanded && (
                                  <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                                    <p className="mb-2 text-xs font-medium text-stone-600">
                                      参加設定
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div>
                                        <label className="mb-0.5 block text-xs text-stone-500">
                                          関わり度
                                        </label>
                                        <select
                                          value={joinEntry!.involvement}
                                          onChange={(e) =>
                                            setJoinEntry((j) =>
                                              j
                                                ? {
                                                    ...j,
                                                    involvement:
                                                      e.target.value as Involvement,
                                                  }
                                                : j
                                            )
                                          }
                                          className="rounded border border-stone-300 px-2 py-1 text-xs"
                                        >
                                          {INVOLVEMENT_OPTIONS.map((inv) => (
                                            <option key={inv} value={inv}>
                                              {INVOLVEMENT_LABELS[inv]}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="mt-3.5">
                                        <button
                                          type="button"
                                          onClick={() => handleJoin(sp)}
                                          disabled={joining}
                                          className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                        >
                                          {joining ? "参加中…" : "参加を確定"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border-t border-stone-100 px-4 py-2.5">
                          <p className="text-xs text-stone-400">
                            子案件はまだありません
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between border-t border-stone-200 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (adminMode) {
                router.push(`/admin/projects/new?clientId=${clientId}`);
              } else {
                router.push(`/mypage/projects/new?clientId=${clientId}`);
              }
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            ＋ 新規案件を作る
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
