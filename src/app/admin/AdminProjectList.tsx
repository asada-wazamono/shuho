"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Project = {
  id: string;
  name: string;
  status: string;
  ownerDepartment: string;
  updatedAt: string;
  client: { name: string };
  projectType: string;
  businessContent: string;
  businessLevel: number;
  workloadLevel: number;
  judgmentLevel: number;
  totalBudget: number | null;
  departmentBudget: number | null;
  optionalAmount: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  statusUpdatedAt: string | null;
  assignees: { user: { name: string; department: string } }[];
};

type SortDir = "asc" | "desc";
type SortKey =
  | "ownerDepartment"
  | "assignees"
  | "client"
  | "name"
  | "projectType"
  | "status"
  | "businessContent"
  | "totalBudget"
  | "departmentBudget"
  | "optionalAmount"
  | "periodStart"
  | "periodEnd"
  | "updatedAt"
  | "statusElapsedDays";

function elapsedDaysFrom(dateString: string | null): number | null {
  if (!dateString) return null;
  const ms = Date.now() - new Date(dateString).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function AdminProjectList() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"decided" | "proposal">("decided");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState({
    ownerDepartment: "",
    assignee: "",
    client: "",
    projectType: "",
    businessContent: "",
    status: "",
    periodStart: "",
    periodEnd: "",
  });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "proposal" || t === "decided") {
      setTab(t);
    }
  }, [searchParams]);

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
        const message = e instanceof Error ? e.message : "案件一覧の取得に失敗しました";
        setLoadError(message);
        setProjects([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab]);

  useEffect(() => {
    if (tab === "decided" && filters.status) {
      setFilters((f) => ({ ...f, status: "" }));
    }
  }, [tab]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
    const assignees = uniq(
      projects.flatMap((p) => p.assignees.map((a) => `${a.user.department}:${a.user.name}`))
    );
    return {
      ownerDepartments: uniq(projects.map((p) => p.ownerDepartment)),
      clients: uniq(projects.map((p) => p.client.name)),
      projectTypes: uniq(projects.map((p) => p.projectType)),
      businessContents: uniq(projects.map((p) => p.businessContent)),
      assignees,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.ownerDepartment && p.ownerDepartment !== filters.ownerDepartment) return false;
      if (filters.client && p.client.name !== filters.client) return false;
      if (filters.projectType && p.projectType !== filters.projectType) return false;
      if (filters.businessContent && p.businessContent !== filters.businessContent) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.assignee) {
        const assignees = p.assignees.map((a) => `${a.user.department}:${a.user.name}`);
        if (!assignees.includes(filters.assignee)) return false;
      }
      if (filters.periodStart) {
        const start = p.periodStart ? p.periodStart.slice(0, 10) : "";
        if (!start || start < filters.periodStart) return false;
      }
      if (filters.periodEnd) {
        const end = p.periodEnd ? p.periodEnd.slice(0, 10) : "";
        if (!end || end > filters.periodEnd) return false;
      }
      return true;
    });
  }, [projects, filters]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (!sortKey) return list;
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "ownerDepartment":
          av = a.ownerDepartment;
          bv = b.ownerDepartment;
          break;
        case "assignees":
          av = a.assignees.map((x) => `${x.user.department}:${x.user.name}`).join(", ");
          bv = b.assignees.map((x) => `${x.user.department}:${x.user.name}`).join(", ");
          break;
        case "client":
          av = a.client.name;
          bv = b.client.name;
          break;
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "projectType":
          av = a.projectType;
          bv = b.projectType;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "businessContent":
          av = a.businessContent;
          bv = b.businessContent;
          break;
        case "totalBudget":
          av = a.totalBudget ?? -1;
          bv = b.totalBudget ?? -1;
          break;
        case "departmentBudget":
          av = a.departmentBudget ?? -1;
          bv = b.departmentBudget ?? -1;
          break;
        case "optionalAmount":
          av = a.optionalAmount ?? -1;
          bv = b.optionalAmount ?? -1;
          break;
        case "periodStart":
          av = a.periodStart ? new Date(a.periodStart).getTime() : -1;
          bv = b.periodStart ? new Date(b.periodStart).getTime() : -1;
          break;
        case "periodEnd":
          av = a.periodEnd ? new Date(a.periodEnd).getTime() : -1;
          bv = b.periodEnd ? new Date(b.periodEnd).getTime() : -1;
          break;
        case "updatedAt":
          av = new Date(a.updatedAt).getTime();
          bv = new Date(b.updatedAt).getTime();
          break;
        case "statusElapsedDays":
          av = elapsedDaysFrom(a.statusUpdatedAt) ?? -1;
          bv = elapsedDaysFrom(b.statusUpdatedAt) ?? -1;
          break;
      }
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ja") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const shortName = (name: string) => {
    const trimmed = String(name).trim();
    const withoutAfterSpace = trimmed.replace(/[\s　].*$/, "");
    return withoutAfterSpace || trimmed;
  };

  return (
    <section className="rounded border border-stone-200 bg-white shadow-sm">
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setTab("decided")}
          className={`px-4 py-3 text-sm font-medium ${tab === "decided" ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500"}`}
        >
          決定案件
        </button>
        <button
          type="button"
          onClick={() => setTab("proposal")}
          className={`px-4 py-3 text-sm font-medium ${tab === "proposal" ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500"}`}
        >
          提案案件
        </button>
      </div>
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap gap-3 text-sm">
          {tab === "proposal" && (
            <label className="flex items-center gap-2">
              状態
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="rounded border border-stone-300 bg-white px-2 py-1"
              >
                <option value="">全て</option>
                <option value="undecided">未定</option>
                <option value="bad">Bad</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            担当部署
            <select
              value={filters.ownerDepartment}
              onChange={(e) => setFilters((f) => ({ ...f, ownerDepartment: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            >
              <option value="">全て</option>
              {filterOptions.ownerDepartments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            担当者
            <select
              value={filters.assignee}
              onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            >
              <option value="">全て</option>
              {filterOptions.assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            クライアント
            <select
              value={filters.client}
              onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            >
              <option value="">全て</option>
              {filterOptions.clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            種別
            <select
              value={filters.projectType}
              onChange={(e) => setFilters((f) => ({ ...f, projectType: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            >
              <option value="">全て</option>
              {filterOptions.projectTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            業務内容
            <select
              value={filters.businessContent}
              onChange={(e) => setFilters((f) => ({ ...f, businessContent: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            >
              <option value="">全て</option>
              {filterOptions.businessContents.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            実施開始
            <input
              type="date"
              value={filters.periodStart}
              onChange={(e) => setFilters((f) => ({ ...f, periodStart: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            実施終了
            <input
              type="date"
              value={filters.periodEnd}
              onChange={(e) => setFilters((f) => ({ ...f, periodEnd: e.target.value }))}
              className="rounded border border-stone-300 bg-white px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={() => setFilters({ ownerDepartment: "", assignee: "", client: "", projectType: "", businessContent: "", status: "", periodStart: "", periodEnd: "" })}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm hover:bg-stone-100"
          >
            クリア
          </button>
        </div>
      </div>
      <div className="overflow-x-auto p-2">
        {loading ? (
          <p className="p-4 text-stone-500">読み込み中…</p>
        ) : loadError ? (
          <p className="p-4 text-red-700">読み込み失敗: {loadError}</p>
        ) : sorted.length === 0 ? (
          <p className="p-4 text-stone-500">該当する案件はありません</p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                {tab === "proposal" && (
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1">
                      状態 {sortKey === "status" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                )}
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("ownerDepartment")} className="inline-flex items-center gap-1">
                    担当部署 {sortKey === "ownerDepartment" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2 min-w-[220px]">
                  <button type="button" onClick={() => toggleSort("assignees")} className="inline-flex items-center gap-1">
                    担当者 {sortKey === "assignees" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("client")} className="inline-flex items-center gap-1">
                    クライアント {sortKey === "client" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">
                    案件名 {sortKey === "name" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("projectType")} className="inline-flex items-center gap-1">
                    種別 {sortKey === "projectType" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("businessContent")} className="inline-flex items-center gap-1">
                    業務内容 {sortKey === "businessContent" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("totalBudget")} className="inline-flex items-center gap-1">
                    全体予算 {sortKey === "totalBudget" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("departmentBudget")} className="inline-flex items-center gap-1">
                    部門予算 {sortKey === "departmentBudget" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("optionalAmount")} className="inline-flex items-center gap-1">
                    任意額 {sortKey === "optionalAmount" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("periodStart")} className="inline-flex items-center gap-1">
                    実施期間 {sortKey === "periodStart" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("statusElapsedDays")} className="inline-flex items-center gap-1">
                    ステータス経過日数 {sortKey === "statusElapsedDays" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="p-2">
                  <button type="button" onClick={() => toggleSort("updatedAt")} className="inline-flex items-center gap-1">
                    最終更新 {sortKey === "updatedAt" && <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const assignees = p.assignees.map((a) => `${a.user.department}:${shortName(a.user.name)}`).join(" / ");
                const period = [p.periodStart, p.periodEnd].filter(Boolean).map((d) => d && new Date(d).toLocaleDateString("ja")).join("〜");
                const elapsedDays = elapsedDaysFrom(p.statusUpdatedAt);
                const isStale = elapsedDays != null && elapsedDays >= 14;
                return (
                  <tr key={p.id} className={`border-b border-stone-100 hover:bg-stone-50 ${isStale ? "bg-red-50" : ""}`}>
                    {tab === "proposal" && (
                      <td className="p-2">
                        {p.status === "good" ? "Good" : p.status === "bad" ? "Bad" : "未定"}
                      </td>
                    )}
                    <td className="p-2">{p.ownerDepartment}</td>
                    <td className="min-w-[260px] p-2" title={assignees}>{assignees || "-"}</td>
                    <td className="p-2">{p.client.name}</td>
                    <td className="p-2">
                      <Link href={`/admin/projects/${p.id}`} className="text-amber-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-2">{p.projectType}</td>
                    <td className="p-2">{p.businessContent}</td>
                    <td className="p-2">{p.totalBudget != null ? p.totalBudget.toLocaleString() : "-"}</td>
                    <td className="p-2">{p.departmentBudget != null ? p.departmentBudget.toLocaleString() : "-"}</td>
                    <td className="p-2">{p.optionalAmount != null ? p.optionalAmount.toLocaleString() : "-"}</td>
                    <td className="p-2">{period || "-"}</td>
                    <td className="p-2">{elapsedDays != null ? `${elapsedDays}日` : "-"}</td>
                    <td className="p-2">{new Date(p.updatedAt).toLocaleDateString("ja")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
