"use client";

import { useEffect, useState, useMemo } from "react";

type Contributor = { projectId: string; projectName: string; kind: "decided" | "proposal"; contribution: number };

type AssigneeRow = {
  userId: string;
  name: string;
  department: string;
  decidedLoad: number;
  proposalLoad: number;
  businessLoad: number;
  workloadLoad: number;
  judgmentLoad: number;
  totalLoad: number;
  absoluteLabel: string;
  deptRank: number;
  deptRankLabel: string;
  companyRank: number;
  companyRankLabel: string;
  proposalCount: number;
  decidedCount: number;
  topContributors: Contributor[];
};

type Summary = {
  totalCount: number;
  totalSales: number;
  departmentSummary: { department: string; sales: number; count: number; avgLoad: string | null }[];
  assigneeRanking: AssigneeRow[];
};

type SortKey = "name" | "department" | "decidedLoad" | "proposalLoad" | "totalLoad" | "deptRank" | "companyRank" | "proposalCount" | "decidedCount";
type SortDir = "asc" | "desc";

function SortBtn({ col, label, sortKey, sortDir, onSort }: { col: SortKey; label: string; sortKey: SortKey | null; sortDir: SortDir; onSort: (k: SortKey) => void }) {
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

// 横積みバー（セグメントごとに色・幅を指定）
function StackedBar({ segments, maxLoad }: {
  segments: { value: number; color: string; label: string }[];
  maxLoad: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0 || maxLoad === 0) {
    return <div className="h-4 w-32 rounded bg-stone-100" />;
  }
  return (
    <div className="flex h-4 w-32 overflow-hidden rounded bg-stone-100" title={segments.map(s => `${s.label}: ${s.value.toFixed(1)}`).join(" / ")}>
      {segments.map((seg, i) =>
        seg.value > 0 ? (
          <div
            key={i}
            style={{ width: `${(seg.value / maxLoad) * 100}%` }}
            className={`h-full ${seg.color}`}
          />
        ) : null
      )}
    </div>
  );
}

export default function AdminSummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [deptFilter, setDeptFilter] = useState("");
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
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleDept(dept: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  }

  const departments = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.assigneeRanking.map((u) => u.department))).sort((a, b) =>
      a.localeCompare(b, "ja")
    );
  }, [data]);

  // 部署別に assigneeRanking から avgDecided / avgProposal を集計
  const deptLoadStats = useMemo(() => {
    if (!data) return {} as Record<string, { avgDecided: number; avgProposal: number; members: AssigneeRow[] }>;
    const groups: Record<string, AssigneeRow[]> = {};
    for (const u of data.assigneeRanking) {
      if (!groups[u.department]) groups[u.department] = [];
      groups[u.department].push(u);
    }
    const result: Record<string, { avgDecided: number; avgProposal: number; members: AssigneeRow[] }> = {};
    for (const [dept, members] of Object.entries(groups)) {
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      result[dept] = {
        avgDecided: avg(members.map((m) => m.decidedLoad)),
        avgProposal: avg(members.map((m) => m.proposalLoad)),
        members: [...members].sort((a, b) => b.totalLoad - a.totalLoad),
      };
    }
    return result;
  }, [data]);

  // バーの最大スケール（全担当者の totalLoad の最大値）
  const maxLoad = useMemo(() => {
    if (!data || data.assigneeRanking.length === 0) return 1;
    return Math.max(...data.assigneeRanking.map((u) => u.totalLoad), 1);
  }, [data]);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.assigneeRanking];
    if (deptFilter) list = list.filter((u) => u.department === deptFilter);
    if (!sortKey) return list;
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [data, deptFilter, sortKey, sortDir]);

  if (!data) return <p className="text-stone-500">読み込み中…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-stone-800">全体数値サマリー</h1>

      {/* 全体サマリー */}
      <section className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-stone-600">全体</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-stone-500">決定案件数</p>
            <p className="text-2xl font-bold">{data.totalCount} 件</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">決定売上合計（部門予算＋任意額）</p>
            <p className="text-2xl font-bold">¥{data.totalSales.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* 部署別 */}
      <section className="rounded border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-stone-600">部署別</h2>
        <p className="mb-3 text-xs text-stone-400">行をクリックすると担当者の内訳を表示</p>

        {/* 凡例 */}
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />決定負荷</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />提案負荷</span>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-600">
              <th className="p-2">部署</th>
              <th className="p-2">決定売上</th>
              <th className="p-2">件数</th>
              <th className="p-2">平均負荷</th>
              <th className="p-2">負荷内訳（担当者平均）</th>
            </tr>
          </thead>
          <tbody>
            {data.departmentSummary.map((d) => {
              const stats = deptLoadStats[d.department];
              const isExpanded = expandedDepts.has(d.department);
              const deptMax = Math.max(maxLoad, 1);
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
                      {stats ? (
                        <StackedBar
                          maxLoad={deptMax}
                          segments={[
                            { value: stats.avgDecided, color: "bg-amber-400", label: "決定" },
                            { value: stats.avgProposal, color: "bg-emerald-400", label: "提案" },
                          ]}
                        />
                      ) : (
                        <div className="h-4 w-32 rounded bg-stone-100" />
                      )}
                    </td>
                  </tr>
                  {isExpanded && stats && stats.members.length > 0 && (
                    <tr key={`${d.department}-expanded`} className="border-b border-stone-100 bg-stone-50">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="space-y-2">
                          {stats.members.map((m) => (
                            <div key={m.userId} className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
                              <span className="w-20 font-medium text-stone-700">{m.name}</span>
                              <span className="text-stone-500">総負荷 {m.totalLoad.toFixed(1)}</span>
                              {m.topContributors.length > 0 && (
                                <span className="text-stone-400">
                                  {m.topContributors.map((c) => (
                                    <span key={`${m.userId}-${c.projectId}`} className="mr-2">
                                      <span className={`mr-0.5 rounded px-1 py-0.5 ${c.kind === "decided" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                        {c.kind === "decided" ? "決" : "提"}
                                      </span>
                                      {c.projectName}（{c.contribution.toFixed(1)}）
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
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          {deptFilter && (
            <button
              type="button"
              onClick={() => setDeptFilter("")}
              className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
            >
              クリア
            </button>
          )}
        </div>

        {/* 凡例 */}
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-300" />業務難易度</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-sky-400" />作業量</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-violet-400" />判断業務</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />提案</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="p-2"><SortBtn col="name" label="氏名" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="department" label="部署" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="totalLoad" label="総合負荷" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2">絶対評価</th>
                <th className="p-2">負荷内訳</th>
                <th className="p-2"><SortBtn col="deptRank" label="部署内" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="companyRank" label="全社" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="decidedCount" label="決定数" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2"><SortBtn col="proposalCount" label="提案数" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="p-2">主な原因（寄与トップ3）</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-stone-500">該当するデータがありません</td>
                </tr>
              ) : (
                filteredAndSorted.map((u) => (
                  <tr key={u.userId} className="border-b border-stone-100">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.department}</td>
                    <td className="p-2 font-semibold">{u.totalLoad.toFixed(1)}</td>
                    <td className="p-2">
                      <span className={u.absoluteLabel === "過負荷" || u.absoluteLabel === "高負荷" ? "font-medium text-amber-700" : ""}>
                        {u.absoluteLabel}
                      </span>
                    </td>
                    <td className="p-2">
                      <StackedBar
                        maxLoad={maxLoad}
                        segments={[
                          { value: u.businessLoad, color: "bg-amber-300", label: "業務難易度" },
                          { value: u.workloadLoad, color: "bg-sky-400", label: "作業量" },
                          { value: u.judgmentLoad, color: "bg-violet-400", label: "判断業務" },
                          { value: u.proposalLoad, color: "bg-emerald-400", label: "提案" },
                        ]}
                      />
                    </td>
                    <td className="p-2">{u.deptRank}位 ({u.deptRankLabel})</td>
                    <td className="p-2">{u.companyRank}位 ({u.companyRankLabel})</td>
                    <td className="p-2">{u.decidedCount}</td>
                    <td className="p-2">{u.proposalCount}</td>
                    <td className="p-2">
                      {u.topContributors.length === 0 ? (
                        "-"
                      ) : (
                        <div className="space-y-1 text-xs">
                          {u.topContributors.map((c) => (
                            <div key={`${u.userId}-${c.projectId}-${c.kind}`}>
                              <span className={`mr-1 rounded px-1 py-0.5 ${c.kind === "decided" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {c.kind === "decided" ? "決定" : "提案"}
                              </span>
                              <span>{c.projectName}</span>
                              <span className="ml-1 text-stone-500">({c.contribution.toFixed(1)})</span>
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
