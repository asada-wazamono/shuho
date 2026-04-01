"use client";

import { useEffect, useState, useMemo } from "react";
import { INVOLVEMENT_LABELS, type Involvement } from "@/lib/constants";

type Contributor = {
  subProjectId: string;
  subProjectName: string;
  parentProjectName: string;
  involvement: string;
  skillLevel: number;
  contribution: number;
};

type AssigneeRow = {
  userId: string;
  name: string;
  department: string;
  totalLoad: number;
  absoluteLabel: string;
  subProjectCount: number;
  deptRank: number;
  deptRankLabel: string;
  companyRank: number;
  companyRankLabel: string;
  topContributors: Contributor[];
};

type Summary = {
  totalCount: number;
  totalSales: number;
  departmentSummary: { department: string; sales: number; count: number; avgLoad: string | null }[];
  assigneeRanking: AssigneeRow[];
};

type SortKey = "name" | "department" | "totalLoad" | "deptRank" | "companyRank" | "subProjectCount";
type SortDir = "asc" | "desc";

function SortBtn({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="inline-flex items-center gap-1 text-left hover:text-stone-900"
    >
      {label}
      {active && <span className="text-xs text-stone-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

// 単色横バー
function LoadBar({ value, maxLoad, label }: { value: number; maxLoad: number; label?: string }) {
  if (value === 0 || maxLoad === 0) {
    return <div className="h-4 w-32 rounded bg-stone-100" />;
  }
  const pct = Math.min((value / maxLoad) * 100, 100);
  const color =
    value > 45 ? "bg-red-500" :
    value > 32 ? "bg-amber-500" :
    value > 20 ? "bg-amber-300" :
    "bg-emerald-400";
  return (
    <div
      className="flex h-4 w-32 overflow-hidden rounded bg-stone-100"
      title={label ?? `${value.toFixed(1)}`}
    >
      <div style={{ width: `${pct}%` }} className={`h-full ${color}`} />
    </div>
  );
}

export default function AdminSummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [deptFilter, setDeptFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

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

  const departments = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.assigneeRanking.map((u) => u.department))).sort((a, b) =>
      a.localeCompare(b, "ja")
    );
  }, [data]);

  const names = useMemo(() => {
    if (!data) return [];
    return data.assigneeRanking.map((u) => u.name).sort((a, b) => a.localeCompare(b, "ja"));
  }, [data]);

  // 部署別 担当者グループ
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

  // バーの最大スケール
  const maxLoad = useMemo(() => {
    if (!data || data.assigneeRanking.length === 0) return 1;
    return Math.max(...data.assigneeRanking.map((u) => u.totalLoad), 1);
  }, [data]);

  // 部署テーブルのバー最大スケール（deptSummary の avgLoad から）
  const maxDeptLoad = useMemo(() => {
    if (!data) return 1;
    const nums = data.departmentSummary
      .map((d) => (d.avgLoad ? parseFloat(d.avgLoad) : 0))
      .filter((n) => !Number.isNaN(n));
    return Math.max(...nums, 1);
  }, [data]);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.assigneeRanking];
    if (deptFilter) list = list.filter((u) => u.department === deptFilter);
    if (nameFilter) list = list.filter((u) => u.name.includes(nameFilter));
    if (!sortKey) return list;
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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
            <p className="text-xs text-stone-500">決定売上合計（子案件部門予算＋任意額）</p>
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
                      <LoadBar value={avgLoadNum} maxLoad={maxDeptLoad} label={`平均 ${d.avgLoad}`} />
                    </td>
                  </tr>
                  {isExpanded && members.length > 0 && (
                    <tr key={`${d.department}-expanded`} className="border-b border-stone-100 bg-stone-50">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="space-y-2">
                          {members.map((m) => (
                            <div key={m.userId} className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
                              <span className="w-20 font-medium text-stone-700">{m.name}</span>
                              <span className="text-stone-500">
                                負荷スコア <span className="font-bold text-stone-800">{m.totalLoad.toFixed(1)}</span>
                              </span>
                              <span className="text-stone-400">({m.absoluteLabel})</span>
                              {m.topContributors.length > 0 && (
                                <span className="text-stone-400">
                                  {m.topContributors.map((c) => (
                                    <span key={`${m.userId}-${c.subProjectId}`} className="mr-2">
                                      <span className="mr-0.5 rounded bg-amber-100 px-1 py-0.5 text-amber-700">
                                        {INVOLVEMENT_LABELS[c.involvement as Involvement] ?? c.involvement}
                                      </span>
                                      {c.parentProjectName}／{c.subProjectName}（{c.contribution.toFixed(1)}）
                                    </span>
                                  ))}
                                </span>
                              )}
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
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">全部署</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            氏名
            <select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">全員</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {(deptFilter || nameFilter) && (
            <button
              type="button"
              onClick={() => { setDeptFilter(""); setNameFilter(""); }}
              className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
            >
              クリア
            </button>
          )}
        </div>

        {/* 凡例 */}
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />余裕あり〜通常</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-300" />やや過多</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-500" />高負荷</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-500" />過負荷</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="p-2"><SortBtn col="name" label="氏名" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="department" label="部署" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="totalLoad" label="負荷スコア" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2">判定</th>
                <th className="p-2">負荷バー</th>
                <th className="p-2"><SortBtn col="deptRank" label="部署内順位" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="companyRank" label="全社順位" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="subProjectCount" label="子案件数" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2">主な原因（寄与トップ3）</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-stone-500">該当するデータがありません</td>
                </tr>
              ) : (
                filteredAndSorted.map((u) => (
                  <tr key={u.userId} className="border-b border-stone-100">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.department}</td>
                    <td className="p-2 font-semibold">{u.totalLoad.toFixed(1)}</td>
                    <td className="p-2">
                      <span className={
                        u.absoluteLabel === "過負荷"
                          ? "font-bold text-red-600"
                          : u.absoluteLabel === "高負荷"
                            ? "font-medium text-amber-600"
                            : u.absoluteLabel === "やや過多"
                              ? "text-amber-500"
                              : "text-stone-500"
                      }>
                        {u.absoluteLabel}
                      </span>
                    </td>
                    <td className="p-2">
                      <LoadBar value={u.totalLoad} maxLoad={maxLoad} label={`${u.totalLoad.toFixed(1)} (${u.absoluteLabel})`} />
                    </td>
                    <td className="p-2">{u.deptRank}位 ({u.deptRankLabel})</td>
                    <td className="p-2">{u.companyRank}位 ({u.companyRankLabel})</td>
                    <td className="p-2">{u.subProjectCount}</td>
                    <td className="p-2">
                      {u.topContributors.length === 0 ? (
                        <span className="text-stone-400">-</span>
                      ) : (
                        <div className="space-y-1 text-xs">
                          {u.topContributors.map((c) => (
                            <div key={`${u.userId}-${c.subProjectId}`} className="flex flex-wrap items-center gap-1">
                              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">
                                {INVOLVEMENT_LABELS[c.involvement as Involvement] ?? c.involvement}/Lv.{c.skillLevel}
                              </span>
                              <span className="text-stone-600">
                                {c.parentProjectName}
                                <span className="mx-0.5 text-stone-400">／</span>
                                {c.subProjectName}
                              </span>
                              <span className="text-stone-400">({c.contribution.toFixed(1)})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
