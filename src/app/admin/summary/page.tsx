"use client";

import { useEffect, useState, useMemo } from "react";
import { INVOLVEMENT_LABELS, type Involvement } from "@/lib/constants";

type DecidedEntry = {
  subProjectId: string;
  subProjectName: string;
  parentProjectName: string;
  involvement: string;
  load: number;
  departmentBudget: number | null;
};

type ProposalEntry = {
  projectId: string;
  projectName: string;
  clientName: string;
  projectType: string;
  involvement: string;
  load: number;
  totalBudget: number | null;
};

type AssigneeRow = {
  userId: string;
  name: string;
  department: string;
  compositeScore: number;
  decidedPct: number;
  proposalPct: number;
  decidedLoad: number;
  decidedBudget: number;
  proposalLoad: number;
  proposalBudget: number;
  proposalCount: number;
  totalLoad: number;
  absoluteLabel: string;
  subProjectCount: number;
  deptRank: number;
  deptRankLabel: string;
  companyRank: number;
  companyRankLabel: string;
  decidedEntries: DecidedEntry[];
  proposalEntries: ProposalEntry[];
};

type Summary = {
  totalCount: number;
  totalSales: number;
  departmentSummary: { department: string; sales: number; count: number; avgLoad: string | null }[];
  assigneeRanking: AssigneeRow[];
};

type SortKey = "name" | "department" | "compositeScore" | "decidedLoad" | "proposalLoad" | "totalLoad" | "deptRank" | "companyRank" | "subProjectCount";
type SortDir = "asc" | "desc";

function SortBtn({ col, label, sortKey, sortDir, onSort }: {
  col: SortKey; label: string; sortKey: SortKey | null; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button type="button" onClick={() => onSort(col)} className="inline-flex items-center gap-1 text-left hover:text-stone-900">
      {label}
      {active && <span className="text-xs text-stone-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

/** 総合スコアのバッジ＋バー */
function CompositeScoreBadge({ score }: { score: number }) {
  const { bg, label } =
    score >= 75 ? { bg: "bg-red-500",    label: "要対応" } :
    score >= 50 ? { bg: "bg-amber-500",  label: "注意"   } :
    score >= 25 ? { bg: "bg-amber-300",  label: "標準"   } :
                  { bg: "bg-emerald-400",label: "余裕"   };
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${bg}`}>
          {score}
        </span>
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
        <div style={{ width: `${score}%` }} className={`h-full rounded-full transition-all ${bg}`} />
      </div>
    </div>
  );
}

/** 負荷バー（単色） */
function LoadBar({ value, maxVal, color }: { value: number; maxVal: number; color: string }) {
  if (maxVal === 0) return <div className="h-1.5 w-full rounded-full bg-stone-100" />;
  const pct = Math.min((value / maxVal) * 100, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div style={{ width: `${pct}%` }} className={`h-full rounded-full ${color}`} />
    </div>
  );
}

const BUDGET_BADGE: Record<number, string> = {
  1: "bg-yellow-400 text-yellow-900",
  2: "bg-stone-300 text-stone-700",
  3: "bg-amber-700 text-amber-50",
};

/** 負荷＋予算の縦2段セル */
function LoadBudgetCell({
  load, budget, maxLoad, maxBudget, loadColor, budgetColor, budgetRank,
}: {
  load: number; budget: number; maxLoad: number; maxBudget: number;
  loadColor: string; budgetColor: string; budgetRank?: number;
}) {
  return (
    <div className="space-y-1.5 min-w-[110px]">
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold">{load.toFixed(1)}</span>
        <span className="text-xs text-stone-400">pt</span>
      </div>
      <LoadBar value={load} maxVal={maxLoad} color={loadColor} />
      <div className="flex items-center gap-1.5 text-xs text-stone-500">
        {budgetRank && (
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${BUDGET_BADGE[budgetRank]}`}>
            {budgetRank}
          </span>
        )}
        ¥{(budget / 10000).toLocaleString()}万
      </div>
      <LoadBar value={budget} maxVal={maxBudget} color={budgetColor} />
    </div>
  );
}

/** 全体負荷バー（既存と同様） */
function TotalLoadBar({ value, maxLoad }: { value: number; maxLoad: number }) {
  if (value === 0 || maxLoad === 0) return <div className="h-4 w-28 rounded bg-stone-100" />;
  const pct = Math.min((value / maxLoad) * 100, 100);
  const color =
    value > 45 ? "bg-red-500" :
    value > 32 ? "bg-amber-500" :
    value > 20 ? "bg-amber-300" :
    "bg-emerald-400";
  return (
    <div className="flex h-4 w-28 overflow-hidden rounded bg-stone-100" title={`${value.toFixed(1)}`}>
      <div style={{ width: `${pct}%` }} className={`h-full ${color}`} />
    </div>
  );
}

export default function AdminSummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [deptFilter, setDeptFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleDept(dept: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept); else next.add(dept);
      return next;
    });
  }

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  const departments = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.assigneeRanking.map((u) => u.department))).sort((a, b) => a.localeCompare(b, "ja"));
  }, [data]);

  const names = useMemo(() => {
    if (!data) return [];
    return data.assigneeRanking.map((u) => u.name).sort((a, b) => a.localeCompare(b, "ja"));
  }, [data]);

  const deptMemberMap = useMemo(() => {
    if (!data) return {} as Record<string, AssigneeRow[]>;
    const groups: Record<string, AssigneeRow[]> = {};
    for (const u of data.assigneeRanking) {
      if (!groups[u.department]) groups[u.department] = [];
      groups[u.department].push(u);
    }
    for (const dept of Object.keys(groups)) {
      groups[dept] = [...groups[dept]].sort((a, b) => b.totalLoad - a.totalLoad);
    }
    return groups;
  }, [data]);

  const maxLoad = useMemo(() => {
    if (!data || data.assigneeRanking.length === 0) return 1;
    return Math.max(...data.assigneeRanking.map((u) => u.totalLoad), 1);
  }, [data]);

  const maxDeptLoad = useMemo(() => {
    if (!data) return 1;
    const nums = data.departmentSummary.map((d) => (d.avgLoad ? parseFloat(d.avgLoad) : 0)).filter((n) => !Number.isNaN(n));
    return Math.max(...nums, 1);
  }, [data]);

  const maxDecidedLoad   = useMemo(() => data ? Math.max(...data.assigneeRanking.map((u) => u.decidedLoad), 1) : 1, [data]);
  const maxProposalLoad  = useMemo(() => data ? Math.max(...data.assigneeRanking.map((u) => u.proposalLoad), 1) : 1, [data]);
  const maxDecidedBudget = useMemo(() => data ? Math.max(...data.assigneeRanking.map((u) => u.decidedBudget), 1) : 1, [data]);
  const maxProposalBudget = useMemo(() => data ? Math.max(...data.assigneeRanking.map((u) => u.proposalBudget), 1) : 1, [data]);

  // 予算ランクマップ（1〜3位のみ）
  const decidedBudgetRankMap = useMemo(() => {
    if (!data) return new Map<string, number>();
    const sorted = [...data.assigneeRanking].sort((a, b) => b.decidedBudget - a.decidedBudget);
    const map = new Map<string, number>();
    let rank = 0, prev = -1;
    for (const u of sorted) {
      if (u.decidedBudget !== prev) { rank++; prev = u.decidedBudget; }
      if (rank <= 3 && u.decidedBudget > 0) map.set(u.userId, rank);
    }
    return map;
  }, [data]);

  const proposalBudgetRankMap = useMemo(() => {
    if (!data) return new Map<string, number>();
    const sorted = [...data.assigneeRanking].sort((a, b) => b.proposalBudget - a.proposalBudget);
    const map = new Map<string, number>();
    let rank = 0, prev = -1;
    for (const u of sorted) {
      if (u.proposalBudget !== prev) { rank++; prev = u.proposalBudget; }
      if (rank <= 3 && u.proposalBudget > 0) map.set(u.userId, rank);
    }
    return map;
  }, [data]);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.assigneeRanking];
    if (deptFilter) list = list.filter((u) => u.department === deptFilter);
    if (nameFilter) list = list.filter((u) => u.name.includes(nameFilter));
    if (!sortKey) return list;
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [data, deptFilter, nameFilter, sortKey, sortDir]);

  if (!data) return <p className="text-stone-500">読み込み中…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-stone-800">全体数値サマリー</h1>

      {/* 全体サマリー */}
      <section className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-stone-600">全体</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-stone-500">決定案件数（親案件）</p>
            <p className="text-2xl font-bold">{data.totalCount} 件</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">決定売上合計（子案件部門予算）</p>
            <p className="text-2xl font-bold">¥{data.totalSales.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* 部署別 */}
      <section className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-stone-600">部署別</h2>
        <p className="mb-3 text-xs text-stone-400">行をクリックすると担当者の内訳を表示</p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-600">
              <th className="p-2">部署</th>
              <th className="p-2">決定売上</th>
              <th className="p-2">件数</th>
              <th className="p-2">平均負荷スコア</th>
              <th className="p-2">負荷バー</th>
            </tr>
          </thead>
          <tbody>
            {data.departmentSummary.map((d) => {
              const members = deptMemberMap[d.department] ?? [];
              const isExpanded = expandedDepts.has(d.department);
              const avgLoadNum = d.avgLoad ? parseFloat(d.avgLoad) : 0;
              return (
                <>
                  <tr
                    key={d.department}
                    className="cursor-pointer border-b border-stone-100 hover:bg-stone-50"
                    onClick={() => toggleDept(d.department)}
                  >
                    <td className="p-2 font-medium">
                      <span className="mr-1 text-stone-400">{isExpanded ? "▾" : "▸"}</span>
                      {d.department}
                    </td>
                    <td className="p-2">¥{d.sales.toLocaleString()}</td>
                    <td className="p-2">{d.count}</td>
                    <td className="p-2">{d.avgLoad ?? "-"}</td>
                    <td className="p-2">
                      <div className="flex h-4 w-32 overflow-hidden rounded bg-stone-100">
                        <div style={{ width: `${Math.min((avgLoadNum / maxDeptLoad) * 100, 100)}%` }} className="h-full bg-amber-300" />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && members.length > 0 && (
                    <tr key={`${d.department}-expanded`} className="border-b border-stone-100 bg-stone-50">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="space-y-1.5">
                          {members.map((m) => (
                            <div key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              <span className="w-20 font-medium text-stone-700">{m.name}</span>
                              <CompositeScoreBadge score={m.compositeScore} />
                              <span className="text-stone-500">
                                決定 <span className="font-bold text-stone-700">{m.decidedLoad.toFixed(1)}</span>
                              </span>
                              <span className="text-stone-400">
                                提案 <span className="font-semibold">{m.proposalLoad.toFixed(1)}</span>
                              </span>
                              <span className="text-stone-500">
                                合計 <span className="font-bold text-stone-800">{m.totalLoad.toFixed(1)}</span>
                                <span className="ml-1 text-stone-400">({m.absoluteLabel})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 担当者別負荷ランキング */}
      <section className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <h2 className="text-sm font-semibold text-stone-600">担当者別負荷ランキング</h2>
          <label className="flex items-center gap-2 text-sm">
            部署
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1 text-sm">
              <option value="">全部署</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            氏名
            <select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1 text-sm">
              <option value="">全員</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {(deptFilter || nameFilter) && (
            <button type="button" onClick={() => { setDeptFilter(""); setNameFilter(""); }} className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100">
              クリア
            </button>
          )}
        </div>

        {/* 凡例 */}
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-stone-500">
          <span className="font-medium text-stone-600">総合スコア：</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />0〜24 余裕</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-amber-300" />25〜49 標準</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-amber-500" />50〜74 注意</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-red-500" />75〜100 要対応</span>
          <span className="ml-2 text-stone-400">※ 行クリックで担当案件を展開</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-600">
                <th className="p-2"><SortBtn col="name" label="氏名" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="department" label="部署" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="compositeScore" label="総合スコア" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="decidedLoad" label="決定（負荷/予算）" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="proposalLoad" label="提案（負荷/予算）" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="totalLoad" label="合計負荷" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2">負荷バー</th>
                <th className="p-2"><SortBtn col="deptRank" label="部署内" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="companyRank" label="全社" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="subProjectCount" label="子案件数" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr><td colSpan={10} className="p-4 text-center text-stone-500">該当するデータがありません</td></tr>
              ) : (
                filteredAndSorted.map((u) => {
                  const isExpanded = expandedUsers.has(u.userId);
                  return (
                    <>
                      <tr
                        key={u.userId}
                        className="cursor-pointer border-b border-stone-100 hover:bg-stone-50"
                        onClick={() => toggleUser(u.userId)}
                      >
                        <td className="p-2 font-medium">
                          <span className="mr-1 text-stone-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                          {u.name}
                        </td>
                        <td className="p-2 text-stone-500">{u.department}</td>
                        <td className="p-2"><CompositeScoreBadge score={u.compositeScore} /></td>
                        <td className="p-2">
                          <LoadBudgetCell
                            load={u.decidedLoad} budget={u.decidedBudget}
                            maxLoad={maxDecidedLoad} maxBudget={maxDecidedBudget}
                            loadColor="bg-amber-400" budgetColor="bg-emerald-400"
                            budgetRank={decidedBudgetRankMap.get(u.userId)}
                          />
                        </td>
                        <td className="p-2">
                          <LoadBudgetCell
                            load={u.proposalLoad} budget={u.proposalBudget}
                            maxLoad={maxProposalLoad} maxBudget={maxProposalBudget}
                            loadColor="bg-sky-400" budgetColor="bg-sky-200"
                            budgetRank={proposalBudgetRankMap.get(u.userId)}
                          />
                        </td>
                        <td className="p-2">
                          <div className="space-y-0.5">
                            <span className="font-semibold">{u.totalLoad.toFixed(1)}</span>
                            <div>
                              <span className={`text-xs ${
                                u.absoluteLabel === "過負荷" ? "font-bold text-red-600" :
                                u.absoluteLabel === "高負荷" ? "font-medium text-amber-600" :
                                u.absoluteLabel === "やや過多" ? "text-amber-500" : "text-stone-400"
                              }`}>{u.absoluteLabel}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-2"><TotalLoadBar value={u.totalLoad} maxLoad={maxLoad} /></td>
                        <td className="p-2 text-stone-500">{u.deptRank}位<span className="ml-0.5 text-xs text-stone-400">({u.deptRankLabel})</span></td>
                        <td className="p-2 text-stone-500">{u.companyRank}位<span className="ml-0.5 text-xs text-stone-400">({u.companyRankLabel})</span></td>
                        <td className="p-2 text-stone-500">{u.subProjectCount}</td>
                      </tr>

                      {/* アコーディオン：担当案件一覧 */}
                      {isExpanded && (
                        <tr key={`${u.userId}-detail`} className="border-b border-stone-200 bg-stone-50">
                          <td colSpan={10} className="px-6 py-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              {/* 決定案件（子案件） */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold text-stone-600">
                                  決定案件（子案件）
                                  <span className="ml-1 text-stone-400 font-normal">{u.decidedEntries.length}件</span>
                                </h4>
                                {u.decidedEntries.length === 0 ? (
                                  <p className="text-xs text-stone-400">なし</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {u.decidedEntries.map((e) => (
                                      <div key={e.subProjectId} className="rounded border border-stone-200 bg-white px-3 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-xs font-medium text-stone-700">{e.parentProjectName}</p>
                                            <p className="truncate text-xs text-stone-500">└ {e.subProjectName}</p>
                                          </div>
                                          <span className="shrink-0 text-xs font-semibold text-amber-600">{e.load.toFixed(1)}pt</span>
                                        </div>
                                        <div className="mt-1 flex gap-3 text-xs text-stone-400">
                                          <span>関わり度：{INVOLVEMENT_LABELS[e.involvement as Involvement] ?? e.involvement}</span>
                                          {e.departmentBudget != null && (
                                            <span>¥{(e.departmentBudget / 10000).toLocaleString()}万</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 提案案件 */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold text-stone-600">
                                  提案案件
                                  <span className="ml-1 text-stone-400 font-normal">{u.proposalEntries.length}件</span>
                                </h4>
                                {u.proposalEntries.length === 0 ? (
                                  <p className="text-xs text-stone-400">なし</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {u.proposalEntries.map((e) => (
                                      <div key={e.projectId} className="rounded border border-stone-200 bg-white px-3 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-xs font-medium text-stone-700">{e.clientName}</p>
                                            <p className="truncate text-xs text-stone-500">└ {e.projectName}</p>
                                          </div>
                                          <span className="shrink-0 text-xs font-semibold text-sky-600">{e.load.toFixed(1)}pt</span>
                                        </div>
                                        <div className="mt-1 flex gap-3 text-xs text-stone-400">
                                          <span>{e.projectType}</span>
                                          <span>関わり度：{INVOLVEMENT_LABELS[e.involvement as Involvement] ?? e.involvement}</span>
                                          {e.totalBudget != null && (
                                            <span>¥{(e.totalBudget / 10000).toLocaleString()}万</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
