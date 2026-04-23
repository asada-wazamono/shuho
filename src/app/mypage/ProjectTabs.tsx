"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  EXECUTION_STATUS_LABELS,
  SUB_PROJECT_STATUS_LABELS,
  INVOLVEMENT_LABELS,
  PROPOSAL_STATUS_LABELS,
  type ExecutionStatus,
  type SubProjectStatus,
} from "@/lib/constants";

type SubProject = {
  id: string;
  name: string;
  status: string;
  businessContent: string | null;
  departmentBudget: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  note: string | null;
  assignees: { userId: string; involvement: string; skillLevel: number; user: { name: string } }[];
};

type Project = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  projectType: string;
  certainty: string;
  businessContent: string;
  totalBudget: number | null;
  optionalAmount: number | null;
  proposalDate: string | null;
  periodStart: string | null;
  note: string | null;
  proposalStatus: string | null;
  proposalStatusUpdatedAt: string | null;
  projectStatus: string | null;
  badReason: string | null;
  createdAt: string;
  statusUpdatedAt: string | null;
  assignees: { user: { id: string; name: string } }[];
  subProjects: SubProject[];
};

type Tab = "proposal" | "decided" | "bad" | "completed";
type SortDir = "asc" | "desc";
type SortKey =
  | "createdAt"
  | "client"
  | "name"
  | "projectType"
  | "certainty"
  | "businessContent"
  | "totalBudget"
  | "proposalDate"
  | "periodStart"
  | "statusElapsedDays"
  | "note"
  | "badReason";

function elapsedDaysFrom(dateString: string | null): number | null {
  if (!dateString) return null;
  const ms = Date.now() - new Date(dateString).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function SortTh({
  sortK,
  label,
  activeSortKey,
  sortDir,
  onToggle,
}: {
  sortK: SortKey;
  label: string;
  activeSortKey: SortKey | null;
  sortDir: SortDir;
  onToggle: (k: SortKey) => void;
}) {
  return (
    <th className="p-2">
      <button
        type="button"
        onClick={() => onToggle(sortK)}
        className="inline-flex items-center gap-1 text-left hover:text-stone-900"
      >
        {label}
        {activeSortKey === sortK && (
          <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>
        )}
      </button>
    </th>
  );
}

export function ProjectTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("proposal");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState({
    client: "",
    projectType: "",
    certainty: "",
    businessContent: "",
    periodStart: "",
    periodEnd: "",
  });
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "proposal" || t === "decided" || t === "bad") {
      setTab(t as Tab);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setMyUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    fetch(`/api/projects?tab=${tab}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || "案件一覧の取得に失敗しました");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "案件一覧の取得に失敗しました");
        setProjects([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [tab]);

  async function handleStatusChange(project: Project, next: string) {
    if (next === project.status) return;
    if (next === "bad") {
      // Bad requires a reason — go to detail page
      router.push(`/mypage/projects/${project.id}`);
      return;
    }
    if (next === "good") {
      const ok = confirm("Goodにすると決定案件になります。続けて子案件を登録します。確定しますか？");
      if (!ok) return;
    }
    const prev = project.status;
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, status: next } : p)));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新に失敗しました");
      if (next === "good") {
        router.push(`/mypage/projects/${project.id}/subprojects/new`);
        return;
      }
      setProjects((list) => list.map((p) => (p.id === project.id ? data : p)));
    } catch (e) {
      setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, status: prev } : p)));
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.client && p.client.name !== filters.client) return false;
      // 決定案件タブは種別・業務内容・期間を親レベルでフィルタしない（子案件レベルでフィルタ）
      if (tab !== "decided") {
        if (filters.projectType && p.projectType !== filters.projectType) return false;
        if (filters.businessContent && p.businessContent !== filters.businessContent) return false;
        if (filters.periodStart) {
          const start = p.periodStart ? p.periodStart.slice(0, 10) : "";
          if (!start || start < filters.periodStart) return false;
        }
        if (filters.periodEnd) {
          const end = p.periodStart ? p.periodStart.slice(0, 10) : "";
          if (!end || end > filters.periodEnd) return false;
        }
      }
      if (tab === "proposal" && filters.certainty && p.certainty !== filters.certainty) return false;
      return true;
    });
  }, [projects, filters, tab]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (!sortKey) {
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "createdAt":    av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); break;
        case "client":       av = a.client.name; bv = b.client.name; break;
        case "name":         av = a.name; bv = b.name; break;
        case "projectType":  av = a.projectType; bv = b.projectType; break;
        case "certainty":    av = a.certainty; bv = b.certainty; break;
        case "businessContent": av = a.businessContent; bv = b.businessContent; break;
        case "totalBudget":  av = a.totalBudget ?? -1; bv = b.totalBudget ?? -1; break;
        case "proposalDate": av = a.proposalDate ? new Date(a.proposalDate).getTime() : -1; bv = b.proposalDate ? new Date(b.proposalDate).getTime() : -1; break;
        case "periodStart":  av = a.periodStart ? new Date(a.periodStart).getTime() : -1; bv = b.periodStart ? new Date(b.periodStart).getTime() : -1; break;
        case "note":         av = a.note ?? ""; bv = b.note ?? ""; break;
        case "badReason":    av = a.badReason ?? ""; bv = b.badReason ?? ""; break;
        case "statusElapsedDays": av = elapsedDaysFrom(a.statusUpdatedAt) ?? -1; bv = elapsedDaysFrom(b.statusUpdatedAt) ?? -1; break;
      }
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
    return {
      clients: uniq(projects.map((p) => p.client.name)),
      projectTypes: uniq(projects.map((p) => p.projectType)),
      certainties: uniq(projects.map((p) => p.certainty)),
      businessContents: uniq(projects.map((p) => p.businessContent)),
      subProjectBusinessContents: uniq(
        projects.flatMap((p) => p.subProjects.map((sp) => sp.businessContent ?? ""))
      ),
    };
  }, [projects]);

  const sortProps = { activeSortKey: sortKey, sortDir, onToggle: toggleSort };

  return (
    <section className="rounded border border-stone-200 bg-white shadow-sm">
      {/* タブ */}
      <div className="flex border-b border-stone-200">
        {(["proposal", "decided", "completed", "bad"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium ${
              tab === key ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {key === "proposal" ? "提案案件" : key === "decided" ? "決定案件" : key === "completed" ? "完了案件" : "Bad案件"}
          </button>
        ))}
      </div>

      {/* フィルター */}
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            クライアント
            <select value={filters.client} onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
              <option value="">全て</option>
              {filterOptions.clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {tab !== "decided" && (
            <label className="flex items-center gap-2">
              種別
              <select value={filters.projectType} onChange={(e) => setFilters((f) => ({ ...f, projectType: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
                <option value="">全て</option>
                {filterOptions.projectTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}
          {tab === "proposal" && (
            <label className="flex items-center gap-2">
              確度
              <select value={filters.certainty} onChange={(e) => setFilters((f) => ({ ...f, certainty: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
                <option value="">全て</option>
                {filterOptions.certainties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            業務内容
            <select value={filters.businessContent} onChange={(e) => setFilters((f) => ({ ...f, businessContent: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
              <option value="">全て</option>
              {tab === "decided"
                ? filterOptions.subProjectBusinessContents.map((b) => <option key={b} value={b}>{b}</option>)
                : filterOptions.businessContents.map((b) => <option key={b} value={b}>{b}</option>)
              }
            </select>
          </label>
          {tab !== "bad" && (
            <>
              <label className="flex items-center gap-2">
                実施開始
                <input type="date" value={filters.periodStart} onChange={(e) => setFilters((f) => ({ ...f, periodStart: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1" />
              </label>
              <label className="flex items-center gap-2">
                実施終了
                <input type="date" value={filters.periodEnd} onChange={(e) => setFilters((f) => ({ ...f, periodEnd: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1" />
              </label>
            </>
          )}
          <button type="button" onClick={() => setFilters({ client: "", projectType: "", certainty: "", businessContent: "", periodStart: "", periodEnd: "" })} className="rounded border border-stone-300 bg-white px-2 py-1 text-sm hover:bg-stone-100">
            クリア
          </button>
        </div>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto p-2">
        {loading ? (
          <p className="p-4 text-stone-500">読み込み中…</p>
        ) : loadError ? (
          <p className="p-4 text-red-700">読み込み失敗: {loadError}</p>
        ) : sorted.length === 0 ? (
          <p className="p-4 text-stone-500">該当する案件はありません</p>
        ) : tab === "proposal" ? (
          /* ─── 提案案件タブ ─── */
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh sortK="createdAt" label="追加日" {...sortProps} />
                <th className="p-2">結果</th>
                <th className="p-2">提案状況</th>
                <SortTh sortK="client" label="クライアント" {...sortProps} />
                <SortTh sortK="name" label="案件名" {...sortProps} />
                <SortTh sortK="projectType" label="種別" {...sortProps} />
                <SortTh sortK="certainty" label="確度" {...sortProps} />
                <SortTh sortK="businessContent" label="業務内容" {...sortProps} />
                <SortTh sortK="totalBudget" label="全体予算" {...sortProps} />
                <SortTh sortK="proposalDate" label="提案日" {...sortProps} />
                <SortTh sortK="periodStart" label="実施想定日" {...sortProps} />
                <SortTh sortK="statusElapsedDays" label="経過日数" {...sortProps} />
                <SortTh sortK="note" label="備考" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const elapsedDays = elapsedDaysFrom(p.proposalStatusUpdatedAt);
                const isStale = elapsedDays != null && elapsedDays >= 14;
                const statusLabel = p.proposalStatus
                  ? (PROPOSAL_STATUS_LABELS[p.proposalStatus as keyof typeof PROPOSAL_STATUS_LABELS] ?? p.proposalStatus)
                  : "-";
                return (
                  <tr key={p.id} className={`border-b border-stone-100 hover:bg-stone-50 ${isStale ? "bg-red-50" : ""}`}>
                    <td className="p-2">{new Date(p.createdAt).toLocaleDateString("ja")}</td>
                    <td className="p-2">
                      <select
                        value={p.status}
                        onChange={(e) => handleStatusChange(p, e.target.value)}
                        className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="undecided">未定</option>
                        <option value="good">Good</option>
                        <option value="bad">Bad</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <span className="text-xs text-stone-600">{statusLabel}</span>
                    </td>
                    <td className="p-2">{p.client.name}</td>
                    <td className="p-2">
                      <Link href={`/mypage/projects/${p.id}`} className="text-amber-700 hover:underline">{p.name}</Link>
                    </td>
                    <td className="p-2">{p.projectType}</td>
                    <td className="p-2">{p.certainty}</td>
                    <td className="p-2">{p.businessContent}</td>
                    <td className="p-2">{p.totalBudget != null ? `¥${p.totalBudget.toLocaleString()}` : "-"}</td>
                    <td className="p-2">{p.proposalDate ? new Date(p.proposalDate).toLocaleDateString("ja") : "-"}</td>
                    <td className="p-2">{p.periodStart ? new Date(p.periodStart).toLocaleDateString("ja") : "-"}</td>
                    <td className="p-2">{elapsedDays != null ? `${elapsedDays}日` : "-"}</td>
                    <td className="p-2">
                      <div className="group relative max-w-[120px]">
                        <span className="block truncate">{p.note ?? "-"}</span>
                        {p.note && (
                          <div className="pointer-events-none absolute right-0 top-full z-50 hidden w-64 whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 text-xs text-stone-700 shadow-lg group-hover:block">
                            {p.note}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : tab === "decided" ? (
          /* ─── 決定案件タブ（子案件ベースのフラット表示） ─── */
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh sortK="client" label="クライアント" {...sortProps} />
                <SortTh sortK="name"   label="案件名" {...sortProps} />
                <th className="p-2">子案件名</th>
                <th className="p-2">状況</th>
                <th className="p-2">部門予算</th>
                <th className="p-2">実施期間</th>
                <th className="p-2">担当者</th>
                <th className="p-2">親案件</th>
                <th className="p-2">備考</th>
              </tr>
            </thead>
            <tbody>
              {sorted.flatMap((p) => {
                // 子案件レベルでフィルタリング
                const hasSubFilter = !!(filters.businessContent || filters.periodStart || filters.periodEnd);
                const visibleSps = p.subProjects.filter((sp) => {
                  if (filters.businessContent && (sp.businessContent ?? "") !== filters.businessContent) return false;
                  if (filters.periodStart && (!sp.periodStart || sp.periodStart.slice(0, 10) < filters.periodStart)) return false;
                  if (filters.periodEnd && (!sp.periodEnd || sp.periodEnd.slice(0, 10) > filters.periodEnd)) return false;
                  return true;
                });

                // 子案件未登録でサブフィルターなしのみ未登録行を表示
                if (p.subProjects.length === 0 && !hasSubFilter) {
                  return [(
                    <tr key={p.id} className="border-b border-stone-100 bg-stone-50/50">
                      <td className="p-2 text-stone-400 text-xs">{p.client.name}</td>
                      <td className="p-2">
                        <Link
                          href={`/mypage/projects/${p.id}`}
                          className="text-sm font-medium text-stone-500 hover:text-amber-700 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="p-2" colSpan={5}>
                        <div className="flex items-center gap-2 text-stone-400 text-xs">
                          <span>— 子案件未登録</span>
                          <Link
                            href={`/mypage/projects/${p.id}/subprojects/new`}
                            className="text-amber-600 hover:underline"
                          >
                            ＋ 追加
                          </Link>
                        </div>
                      </td>
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          p.projectStatus === "completed"
                            ? "bg-stone-100 text-stone-500"
                            : p.projectStatus === "suspended"
                              ? "bg-red-100 text-red-600"
                              : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {p.projectStatus
                            ? (EXECUTION_STATUS_LABELS[p.projectStatus as ExecutionStatus] ?? p.projectStatus)
                            : "-"}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-stone-400">-</td>
                    </tr>
                  )];
                }

                return visibleSps.map((sp) => {
                  const isMySubProject = myUserId
                    ? sp.assignees.some((a) => a.userId === myUserId)
                    : false;
                  return (
                    <tr key={sp.id} className="border-b border-stone-100 hover:bg-amber-50/30">
                      <td className="p-2 text-stone-600 text-xs">{p.client.name}</td>
                      <td className="p-2">
                        <Link
                          href={`/mypage/projects/${p.id}`}
                          className="text-stone-700 hover:text-amber-700 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="p-2">
                        {isMySubProject ? (
                          <Link
                            href={`/mypage/subprojects/${sp.id}`}
                            className="font-medium text-stone-800 hover:text-amber-700 hover:underline"
                          >
                            {sp.name}
                          </Link>
                        ) : (
                          <span className="text-stone-500">{sp.name}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          sp.status === "completed"
                            ? "bg-stone-100 text-stone-500"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {SUB_PROJECT_STATUS_LABELS[sp.status as SubProjectStatus] ?? sp.status}
                        </span>
                      </td>
                      <td className="p-2 font-medium text-amber-700">
                        {sp.departmentBudget != null ? `¥${sp.departmentBudget.toLocaleString()}` : "-"}
                      </td>
                      <td className="p-2 text-xs text-stone-500">
                        {sp.periodStart ? sp.periodStart.slice(0, 7) : ""}
                        {sp.periodEnd ? `〜${sp.periodEnd.slice(0, 7)}` : ""}
                        {!sp.periodStart && !sp.periodEnd && "-"}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {sp.assignees.length === 0 ? (
                            <span className="text-xs text-stone-400">-</span>
                          ) : sp.assignees.map((a) => (
                            <span key={a.userId} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                              {a.user.name}
                              <span className="ml-0.5 text-stone-400">
                                {INVOLVEMENT_LABELS[a.involvement as keyof typeof INVOLVEMENT_LABELS] ?? a.involvement}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          p.projectStatus === "completed"
                            ? "bg-stone-100 text-stone-500"
                            : p.projectStatus === "suspended"
                              ? "bg-red-100 text-red-600"
                              : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {p.projectStatus
                            ? (EXECUTION_STATUS_LABELS[p.projectStatus as ExecutionStatus] ?? p.projectStatus)
                            : "-"}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="group relative max-w-[120px]">
                          <span className="block truncate text-xs">{sp.note ?? "-"}</span>
                          {sp.note && (
                            <div className="pointer-events-none absolute right-0 top-full z-50 hidden w-64 whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 text-xs text-stone-700 shadow-lg group-hover:block">
                              {sp.note}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        ) : tab === "completed" ? (
          /* ─── 完了案件タブ ─── */
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh sortK="client" label="クライアント" {...sortProps} />
                <SortTh sortK="name"   label="案件名" {...sortProps} />
                <th className="p-2">子案件名</th>
                <th className="p-2">部門予算</th>
                <th className="p-2">実施期間</th>
                <th className="p-2">担当者</th>
              </tr>
            </thead>
            <tbody>
              {sorted.flatMap((p) => {
                if (p.subProjects.length === 0) {
                  return (
                    <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="p-2">{p.client.name}</td>
                      <td className="p-2">
                        <Link href={`/mypage/projects/${p.id}`} className="text-amber-700 hover:underline">{p.name}</Link>
                      </td>
                      <td className="p-2 text-stone-400">-</td>
                      <td className="p-2">{p.totalBudget != null ? `¥${p.totalBudget.toLocaleString()}` : "-"}</td>
                      <td className="p-2">-</td>
                      <td className="p-2">{p.assignees.map((a) => a.user.name).join(", ")}</td>
                    </tr>
                  );
                }
                return p.subProjects.map((sp, i) => (
                  <tr key={sp.id} className="border-b border-stone-100 hover:bg-stone-50">
                    {i === 0 && (
                      <>
                        <td className="p-2 align-top" rowSpan={p.subProjects.length}>{p.client.name}</td>
                        <td className="p-2 align-top" rowSpan={p.subProjects.length}>
                          <Link href={`/mypage/projects/${p.id}`} className="text-amber-700 hover:underline">{p.name}</Link>
                        </td>
                      </>
                    )}
                    <td className="p-2 text-stone-600">└ {sp.name}</td>
                    <td className="p-2">{sp.departmentBudget != null ? `¥${sp.departmentBudget.toLocaleString()}` : "-"}</td>
                    <td className="p-2 text-xs">
                      {sp.periodStart ? new Date(sp.periodStart).toLocaleDateString("ja") : "-"}
                      {sp.periodEnd ? ` 〜 ${new Date(sp.periodEnd).toLocaleDateString("ja")}` : ""}
                    </td>
                    <td className="p-2">{sp.assignees.map((a) => a.user.name).join(", ")}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        ) : (
          /* ─── Bad案件タブ ─── */
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh sortK="createdAt" label="追加日" {...sortProps} />
                <SortTh sortK="client" label="クライアント" {...sortProps} />
                <SortTh sortK="name" label="案件名" {...sortProps} />
                <SortTh sortK="projectType" label="種別" {...sortProps} />
                <SortTh sortK="businessContent" label="業務内容" {...sortProps} />
                <SortTh sortK="totalBudget" label="全体予算" {...sortProps} />
                <SortTh sortK="badReason" label="Badの理由" {...sortProps} />
                <SortTh sortK="note" label="備考" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="p-2">{new Date(p.createdAt).toLocaleDateString("ja")}</td>
                  <td className="p-2">{p.client.name}</td>
                  <td className="p-2">
                    <Link href={`/mypage/projects/${p.id}`} className="text-amber-700 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-2">{p.projectType}</td>
                  <td className="p-2">{p.businessContent}</td>
                  <td className="p-2">{p.totalBudget != null ? `¥${p.totalBudget.toLocaleString()}` : "-"}</td>
                  <td className="max-w-[240px] p-2 text-xs text-stone-600 whitespace-pre-wrap">{p.badReason ?? "-"}</td>
                  <td className="p-2">
                    <div className="group relative max-w-[120px]">
                      <span className="block truncate">{p.note ?? "-"}</span>
                      {p.note && (
                        <div className="pointer-events-none absolute right-0 top-full z-50 hidden w-64 whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 text-xs text-stone-700 shadow-lg group-hover:block">
                          {p.note}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
