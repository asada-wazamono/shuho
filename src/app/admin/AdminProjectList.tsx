"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PROPOSAL_STATUS_LABELS,
  SUB_PROJECT_STATUS_LABELS,
  type SubProjectStatus,
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
  businessContent: string | null;
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
  updatedAt: string;
  client: { id: string; name: string };
  projectType: string;
  businessContent: string;
  totalBudget: number | null;
  proposalDate: string | null;
  periodStart: string | null;
  proposalStatus: string | null;
  projectStatus: string | null;
  badReason: string | null;
  note: string | null;
  mergedIntoId: string | null;
  assignees: { user: { name: string; department: string } }[];
  subProjects: SubProject[];
};

type Tab = "decided" | "proposal" | "bad";
type SortDir = "asc" | "desc";

type FieldChoice = "source" | "target";
type MergeChoices = {
  totalBudget?: FieldChoice;
  ownerDepartment?: FieldChoice;
  businessContent?: FieldChoice;
  projectType?: FieldChoice;
};
type MergeState = {
  sourceId: string;
  sourceName: string;
  clientName: string;
  clientId: string;
  isDecided: boolean;
};

type DecidedRow = {
  parentId: string;
  parentName: string;
  ownerDepartment: string;
  clientName: string;
  totalBudget: number | null;
  updatedAt: string;
  subProject: SubProject;
};

function SortTh({
  k, label, sortKey, sortDir, onToggle,
}: {
  k: string; label: string; sortKey: string | null; sortDir: SortDir; onToggle: (k: string) => void;
}) {
  return (
    <th className="p-2">
      <button type="button" onClick={() => onToggle(k)} className="inline-flex items-center gap-1 hover:text-stone-900">
        {label}
        {sortKey === k && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

const shortName = (name: string) => String(name).trim().replace(/[\s　].*$/, "") || name;

export function AdminProjectList() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("decided");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeChoices, setMergeChoices] = useState<MergeChoices>({});
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [filters, setFilters] = useState({
    ownerDepartment: "",
    assignee: "",
    client: "",
    projectType: "",
    businessContent: "",
    proposalStatus: "",
  });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "proposal" || t === "decided" || t === "bad") setTab(t as Tab);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setSortKey(null);
    setFilters({ ownerDepartment: "", assignee: "", client: "", projectType: "", businessContent: "", proposalStatus: "" });
    fetch(`/api/projects?tab=${tab}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || "案件一覧の取得に失敗しました");
        return data;
      })
      .then((data) => { if (active) setProjects(Array.isArray(data) ? data : []); })
      .catch((e) => { if (active) { setLoadError(e instanceof Error ? e.message : "取得に失敗しました"); setProjects([]); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab]);

  async function handleMerge() {
    if (!mergeState || !mergeTargetId) return;
    setMerging(true);
    setMergeError("");
    try {
      const res = await fetch(`/api/admin/projects/${mergeState.sourceId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intoId: mergeTargetId, choices: mergeChoices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "統合に失敗しました");
      const sourceId = mergeState.sourceId;
      setMergeState(null);
      setMergeTargetId("");
      setMergeChoices({});
      setProjects((prev) => prev.filter((p) => p.id !== sourceId));
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "統合に失敗しました");
    } finally {
      setMerging(false);
    }
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortProps = { sortKey, sortDir, onToggle: toggleSort };

  // ── Filter options ────────────────────────────────
  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) =>
      Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
    return {
      ownerDepartments: uniq(projects.map((p) => p.ownerDepartment)),
      clients: uniq(projects.map((p) => p.client.name)),
      assignees: uniq(projects.flatMap((p) => p.assignees.map((a) => `${a.user.department} / ${a.user.name}`))),
      projectTypes: uniq(projects.map((p) => p.projectType)),
      // 決定タブ：子案件の業務内容、その他：親案件の業務内容
      businessContents: tab === "decided"
        ? uniq(projects.flatMap((p) => p.subProjects.map((sp) => sp.businessContent ?? "")))
        : uniq(projects.map((p) => p.businessContent)),
      proposalStatuses: uniq(projects.map((p) => p.proposalStatus ?? "")),
    };
  }, [projects, tab]);

  // ── 決定案件：フラット行 ──────────────────────────
  const allDecidedRows = useMemo<DecidedRow[]>(() =>
    projects.flatMap((p) =>
      p.subProjects.map((sp) => ({
        parentId: p.id,
        parentName: p.name,
        ownerDepartment: p.ownerDepartment,
        clientName: p.client.name,
        totalBudget: p.totalBudget,
        updatedAt: p.updatedAt,
        subProject: sp,
      }))
    ), [projects]);

  const filteredDecidedRows = useMemo<DecidedRow[]>(() =>
    allDecidedRows.filter((row) => {
      if (filters.ownerDepartment && row.ownerDepartment !== filters.ownerDepartment) return false;
      if (filters.client && row.clientName !== filters.client) return false;
      if (filters.businessContent && (row.subProject.businessContent ?? "") !== filters.businessContent) return false;
      if (filters.assignee) {
        const p = projects.find((x) => x.id === row.parentId);
        const assignees = (p?.assignees ?? []).map((a) => `${a.user.department} / ${a.user.name}`);
        if (!assignees.includes(filters.assignee)) return false;
      }
      return true;
    }), [allDecidedRows, filters, projects]);

  const sortedDecidedRows = useMemo<DecidedRow[]>(() => {
    const list = [...filteredDecidedRows];
    if (!sortKey) return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sortKey) {
        case "ownerDepartment": av = a.ownerDepartment; bv = b.ownerDepartment; break;
        case "client":          av = a.clientName; bv = b.clientName; break;
        case "name":            av = a.parentName; bv = b.parentName; break;
        case "subName":         av = a.subProject.name; bv = b.subProject.name; break;
        case "businessContent": av = a.subProject.businessContent ?? ""; bv = b.subProject.businessContent ?? ""; break;
        case "totalBudget":     av = a.totalBudget ?? -1; bv = b.totalBudget ?? -1; break;
        case "departmentBudget":av = a.subProject.departmentBudget ?? -1; bv = b.subProject.departmentBudget ?? -1; break;
        case "periodStart":     av = a.subProject.periodStart ? new Date(a.subProject.periodStart).getTime() : -1; bv = b.subProject.periodStart ? new Date(b.subProject.periodStart).getTime() : -1; break;
        case "updatedAt":       av = new Date(a.updatedAt).getTime(); bv = new Date(b.updatedAt).getTime(); break;
      }
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [filteredDecidedRows, sortKey, sortDir]);

  // ── 提案/Bad：親案件ベース ───────────────────────
  const filteredProjects = useMemo(() =>
    projects.filter((p) => {
      if (filters.ownerDepartment && p.ownerDepartment !== filters.ownerDepartment) return false;
      if (filters.client && p.client.name !== filters.client) return false;
      if (filters.businessContent && p.businessContent !== filters.businessContent) return false;
      if (filters.projectType && p.projectType !== filters.projectType) return false;
      if (filters.proposalStatus && p.proposalStatus !== filters.proposalStatus) return false;
      if (filters.assignee) {
        const assignees = p.assignees.map((a) => `${a.user.department} / ${a.user.name}`);
        if (!assignees.includes(filters.assignee)) return false;
      }
      return true;
    }), [projects, filters]);

  const sortedProjects = useMemo(() => {
    const list = [...filteredProjects];
    if (!sortKey) return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sortKey) {
        case "ownerDepartment": av = a.ownerDepartment; bv = b.ownerDepartment; break;
        case "client":          av = a.client.name; bv = b.client.name; break;
        case "name":            av = a.name; bv = b.name; break;
        case "businessContent": av = a.businessContent; bv = b.businessContent; break;
        case "totalBudget":     av = a.totalBudget ?? -1; bv = b.totalBudget ?? -1; break;
        case "periodStart":     av = a.periodStart ? new Date(a.periodStart).getTime() : -1; bv = b.periodStart ? new Date(b.periodStart).getTime() : -1; break;
        case "projectType":     av = a.projectType; bv = b.projectType; break;
        case "updatedAt":       av = new Date(a.updatedAt).getTime(); bv = new Date(b.updatedAt).getTime(); break;
      }
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [filteredProjects, sortKey, sortDir]);

  const isEmpty = tab === "decided" ? sortedDecidedRows.length === 0 : sortedProjects.length === 0;

  // 決定タブ：親案件ごとに最初の行だけ統合ボタンを表示するためのキーセット
  const firstDecidedRowKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys = new Set<string>();
    for (const row of sortedDecidedRows) {
      if (!seen.has(row.parentId)) {
        seen.add(row.parentId);
        keys.add(`${row.parentId}-${row.subProject.id}`);
      }
    }
    return keys;
  }, [sortedDecidedRows]);

  return (
    <>
    <section className="rounded border border-stone-200 bg-white shadow-sm">
      {/* タブ */}
      <div className="flex border-b border-stone-200">
        {(["decided", "proposal", "bad"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium ${
              tab === t ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t === "decided" ? "決定案件" : t === "proposal" ? "提案案件" : "Bad案件"}
          </button>
        ))}
      </div>

      {/* フィルター */}
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            担当部署
            <select value={filters.ownerDepartment} onChange={(e) => setFilters((f) => ({ ...f, ownerDepartment: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
              <option value="">全て</option>
              {filterOptions.ownerDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            クライアント
            <select value={filters.client} onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
              <option value="">全て</option>
              {filterOptions.clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            業務内容
            <select value={filters.businessContent} onChange={(e) => setFilters((f) => ({ ...f, businessContent: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
              <option value="">全て</option>
              {filterOptions.businessContents.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          {tab === "bad" && (
            <label className="flex items-center gap-2">
              種別
              <select value={filters.projectType} onChange={(e) => setFilters((f) => ({ ...f, projectType: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
                <option value="">全て</option>
                {filterOptions.projectTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}
          {tab !== "bad" && (
            <label className="flex items-center gap-2">
              担当者
              <select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
                <option value="">全て</option>
                {filterOptions.assignees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )}
          {tab === "proposal" && (
            <label className="flex items-center gap-2">
              状況
              <select value={filters.proposalStatus} onChange={(e) => setFilters((f) => ({ ...f, proposalStatus: e.target.value }))} className="rounded border border-stone-300 bg-white px-2 py-1">
                <option value="">全て</option>
                {filterOptions.proposalStatuses.map((s) => (
                  <option key={s} value={s}>
                    {PROPOSAL_STATUS_LABELS[s as keyof typeof PROPOSAL_STATUS_LABELS] ?? s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setFilters({ ownerDepartment: "", assignee: "", client: "", projectType: "", businessContent: "", proposalStatus: "" })}
            className="rounded border border-stone-300 bg-white px-2 py-1 hover:bg-stone-100"
          >
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
        ) : isEmpty ? (
          <p className="p-4 text-stone-500">該当する案件はありません</p>
        ) : tab === "decided" ? (

          /* ─── 決定案件（子案件ベースのフラット表示） ─── */
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh k="ownerDepartment" label="担当部署" {...sortProps} />
                <SortTh k="client"          label="クライアント" {...sortProps} />
                <SortTh k="name"            label="案件名" {...sortProps} />
                <SortTh k="subName"         label="子案件名" {...sortProps} />
                <SortTh k="businessContent" label="業務内容" {...sortProps} />
                <th className="p-2">状況</th>
                <SortTh k="totalBudget"      label="全体予算" {...sortProps} />
                <SortTh k="departmentBudget" label="部門予算" {...sortProps} />
                <SortTh k="periodStart"      label="実施期間" {...sortProps} />
                <th className="p-2">担当者</th>
                <SortTh k="updatedAt" label="最終更新日" {...sortProps} />
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedDecidedRows.map((row) => {
                const sp = row.subProject;
                const rowKey = `${row.parentId}-${sp.id}`;
                const isFirstRow = firstDecidedRowKeys.has(rowKey);
                const sourceProject = projects.find((p) => p.id === row.parentId);
                const sameClientCount = projects.filter(
                  (p) => p.id !== row.parentId && p.client.id === sourceProject?.client.id && p.status === "good" && !p.mergedIntoId
                ).length;
                return (
                  <tr key={rowKey} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-2">{row.ownerDepartment}</td>
                    <td className="p-2">{row.clientName}</td>
                    <td className="p-2">
                      <Link href={`/admin/projects/${row.parentId}`} className="text-amber-700 hover:underline">{row.parentName}</Link>
                    </td>
                    <td className="p-2">
                      <Link href={`/admin/subprojects/${sp.id}`} className="text-stone-700 hover:text-amber-700 hover:underline">{sp.name}</Link>
                    </td>
                    <td className="p-2">{sp.businessContent ?? "-"}</td>
                    <td className="p-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        sp.status === "completed" ? "bg-stone-100 text-stone-500" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {SUB_PROJECT_STATUS_LABELS[sp.status as SubProjectStatus] ?? sp.status}
                      </span>
                    </td>
                    <td className="p-2">{row.totalBudget != null ? `¥${row.totalBudget.toLocaleString()}` : "-"}</td>
                    <td className="p-2">{sp.departmentBudget != null ? `¥${sp.departmentBudget.toLocaleString()}` : "-"}</td>
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
                            {shortName(a.user.name)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">{new Date(row.updatedAt).toLocaleDateString("ja")}</td>
                    <td className="p-2">
                      {isFirstRow && sameClientCount > 0 && sourceProject && (
                        <button
                          type="button"
                          onClick={() => {
                            setMergeState({ sourceId: row.parentId, sourceName: row.parentName, clientName: row.clientName, clientId: sourceProject.client.id, isDecided: true });
                            setMergeTargetId("");
                            setMergeChoices({});
                            setMergeError("");
                          }}
                          className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
                        >
                          統合
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        ) : tab === "proposal" ? (

          /* ─── 提案案件 ─── */
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh k="ownerDepartment" label="担当部署" {...sortProps} />
                <SortTh k="client"          label="クライアント" {...sortProps} />
                <SortTh k="name"            label="案件名" {...sortProps} />
                <SortTh k="businessContent" label="業務内容" {...sortProps} />
                <th className="p-2">状況</th>
                <SortTh k="totalBudget"   label="全体予算" {...sortProps} />
                <SortTh k="proposalDate"  label="提案日" {...sortProps} />
                <SortTh k="periodStart"   label="実施想定日" {...sortProps} />
                <th className="p-2">担当者</th>
                <SortTh k="updatedAt" label="最終更新日" {...sortProps} />
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((p) => {
                const assignees = p.assignees.map((a) => shortName(a.user.name)).join(" / ");
                const statusLabel = p.proposalStatus
                  ? (PROPOSAL_STATUS_LABELS[p.proposalStatus as keyof typeof PROPOSAL_STATUS_LABELS] ?? p.proposalStatus)
                  : "-";
                const sameClientCount = sortedProjects.filter(
                  (x) => x.id !== p.id && x.client.id === p.client.id
                ).length;
                return (
                  <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-2">{p.ownerDepartment}</td>
                    <td className="p-2">{p.client.name}</td>
                    <td className="p-2">
                      <Link href={`/admin/projects/${p.id}`} className="text-amber-700 hover:underline">{p.name}</Link>
                    </td>
                    <td className="p-2">{p.businessContent}</td>
                    <td className="p-2 text-xs">{statusLabel}</td>
                    <td className="p-2">{p.totalBudget != null ? `¥${p.totalBudget.toLocaleString()}` : "-"}</td>
                    <td className="p-2">{p.proposalDate ? new Date(p.proposalDate).toLocaleDateString("ja") : "-"}</td>
                    <td className="p-2">{p.periodStart ? new Date(p.periodStart).toLocaleDateString("ja") : "-"}</td>
                    <td className="p-2">{assignees || "-"}</td>
                    <td className="p-2">{new Date(p.updatedAt).toLocaleDateString("ja")}</td>
                    <td className="p-2">
                      {sameClientCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setMergeState({ sourceId: p.id, sourceName: p.name, clientName: p.client.name, clientId: p.client.id, isDecided: false });
                            setMergeTargetId("");
                            setMergeChoices({});
                            setMergeError("");
                          }}
                          className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
                        >
                          統合
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        ) : (

          /* ─── Bad案件 ─── */
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <SortTh k="ownerDepartment" label="担当部署" {...sortProps} />
                <SortTh k="client"          label="クライアント" {...sortProps} />
                <SortTh k="name"            label="案件名" {...sortProps} />
                <SortTh k="projectType"     label="種別" {...sortProps} />
                <SortTh k="businessContent" label="業務内容" {...sortProps} />
                <SortTh k="totalBudget"     label="全体予算" {...sortProps} />
                <th className="p-2">理由</th>
                <th className="p-2">備考</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="p-2">{p.ownerDepartment}</td>
                  <td className="p-2">{p.client.name}</td>
                  <td className="p-2">
                    <Link href={`/admin/projects/${p.id}`} className="text-amber-700 hover:underline">{p.name}</Link>
                  </td>
                  <td className="p-2">{p.projectType}</td>
                  <td className="p-2">{p.businessContent}</td>
                  <td className="p-2">{p.totalBudget != null ? `¥${p.totalBudget.toLocaleString()}` : "-"}</td>
                  <td className="max-w-[220px] p-2 text-xs text-stone-600 whitespace-pre-wrap">{p.badReason ?? "-"}</td>
                  <td className="max-w-[160px] truncate p-2 text-xs" title={p.note ?? ""}>{p.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

        )}
      </div>
    </section>

      {/* 統合モーダル */}
      {mergeState && (() => {
        const sourceProject = projects.find((p) => p.id === mergeState.sourceId);
        const targetProject = projects.find((p) => p.id === mergeTargetId);
        const candidateProjects = projects.filter(
          (p) => p.id !== mergeState.sourceId && p.client.id === mergeState.clientId &&
          (mergeState.isDecided ? p.status === "good" : p.status === "undecided") && !p.mergedIntoId
        );

        // 差異があるフィールドを計算
        type DiffField = { key: keyof MergeChoices; label: string; sourceVal: string; targetVal: string };
        const diffs: DiffField[] = [];
        if (mergeState.isDecided && sourceProject && targetProject) {
          const fmt = (v: number | null | undefined) => v != null ? `¥${v.toLocaleString()}` : "-";
          if (sourceProject.totalBudget !== targetProject.totalBudget)
            diffs.push({ key: "totalBudget", label: "全体予算", sourceVal: fmt(sourceProject.totalBudget), targetVal: fmt(targetProject.totalBudget) });
          if (sourceProject.ownerDepartment !== targetProject.ownerDepartment)
            diffs.push({ key: "ownerDepartment", label: "担当部署", sourceVal: sourceProject.ownerDepartment, targetVal: targetProject.ownerDepartment });
          if (sourceProject.businessContent !== targetProject.businessContent)
            diffs.push({ key: "businessContent", label: "業務内容", sourceVal: sourceProject.businessContent, targetVal: targetProject.businessContent });
          if (sourceProject.projectType !== targetProject.projectType)
            diffs.push({ key: "projectType", label: "案件種別", sourceVal: sourceProject.projectType, targetVal: targetProject.projectType });
        }

        const allChoicesMade = diffs.every((d) => mergeChoices[d.key] !== undefined);
        const canSubmit = !!mergeTargetId && (!mergeState.isDecided || allChoicesMade);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setMergeState(null); }}
          >
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
                <h2 className="text-base font-bold text-stone-800">案件を統合</h2>
                <button type="button" onClick={() => setMergeState(null)} className="rounded p-1 text-stone-400 hover:bg-stone-100">✕</button>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="text-xs text-stone-500 mb-1">吸収される案件</p>
                  <p className="font-medium text-stone-800">{mergeState.sourceName}</p>
                  <p className="text-xs text-stone-500">{mergeState.clientName}</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">統合先（存続する案件）</label>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => { setMergeTargetId(e.target.value); setMergeChoices({}); }}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
                  >
                    <option value="">選択してください</option>
                    {candidateProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 決定案件：差異フィールドの選択 */}
                {mergeState.isDecided && targetProject && diffs.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-stone-600">項目が異なるため、どちらを使うか選択してください</p>
                    {diffs.map((d) => (
                      <div key={d.key} className="rounded-lg border border-stone-200 p-3">
                        <p className="mb-2 text-xs font-medium text-stone-700">{d.label}</p>
                        <div className="flex gap-3">
                          <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${mergeChoices[d.key] === "source" ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}>
                            <input
                              type="radio"
                              name={d.key}
                              value="source"
                              checked={mergeChoices[d.key] === "source"}
                              onChange={() => setMergeChoices((c) => ({ ...c, [d.key]: "source" }))}
                              className="accent-amber-600"
                            />
                            <span>
                              <span className="text-stone-400">吸収側　</span>
                              <span className="font-medium text-stone-800">{d.sourceVal}</span>
                            </span>
                          </label>
                          <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${mergeChoices[d.key] === "target" ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}>
                            <input
                              type="radio"
                              name={d.key}
                              value="target"
                              checked={mergeChoices[d.key] === "target"}
                              onChange={() => setMergeChoices((c) => ({ ...c, [d.key]: "target" }))}
                              className="accent-amber-600"
                            />
                            <span>
                              <span className="text-stone-400">存続側　</span>
                              <span className="font-medium text-stone-800">{d.targetVal}</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {mergeState.isDecided && targetProject && diffs.length === 0 && mergeTargetId && (
                  <p className="text-xs text-stone-500">全項目が一致しています。そのまま統合できます。</p>
                )}
                {mergeState.isDecided && mergeTargetId && (
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    担当者は自動的にマージされます。子案件はすべて存続側に移動されます。
                  </p>
                )}
                {!mergeState.isDecided && mergeTargetId && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    「{mergeState.sourceName}」の子案件が統合先へ移動され、この案件は非表示になります。
                  </p>
                )}

                {mergeError && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{mergeError}</p>}
                <div className="flex gap-3 border-t border-stone-200 pt-4">
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={!canSubmit || merging}
                    className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {merging ? "統合中…" : "統合する"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeState(null)}
                    className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
