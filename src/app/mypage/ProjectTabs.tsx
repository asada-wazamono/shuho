"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { projectLoadScore } from "@/lib/loadScore";
import { getProjectLoadLabel, PROPOSAL_EFFORT_LABELS } from "@/lib/constants";

type Project = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  projectType: string;
  certainty: string;
  businessContent: string;
  businessLevel: number;
  workloadLevel: number;
  judgmentLevel: number;
  totalBudget: number | null;
  departmentBudget: number | null;
  optionalAmount: number | null;
  proposalDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  note: string | null;
  createdAt: string;
  statusUpdatedAt: string | null;
  proposalEffortType: string | null;
  assignees: { businessLevel: number; workloadLevel: number; judgmentLevel: number; user: { id: string; name: string } }[];
};

type SortDir = "asc" | "desc";
type SortKey =
  | "createdAt"
  | "status"
  | "client"
  | "name"
  | "projectType"
  | "certainty"
  | "businessContent"
  | "totalBudget"
  | "departmentBudget"
  | "optionalAmount"
  | "proposalDate"
  | "periodStart"
  | "periodEnd"
  | "note"
  | "loadScore"
  | "proposalEffortType"
  | "statusElapsedDays";

function avgAssigneeLoad(p: { assignees: { businessLevel: number; workloadLevel: number; judgmentLevel: number }[]; businessLevel: number; workloadLevel: number; judgmentLevel: number }): number {
  if (p.assignees.length > 0) {
    return p.assignees.reduce((sum, a) => sum + projectLoadScore(a.businessLevel, a.workloadLevel, a.judgmentLevel), 0) / p.assignees.length;
  }
  return projectLoadScore(p.businessLevel, p.workloadLevel, p.judgmentLevel);
}

function elapsedDaysFrom(dateString: string | null): number | null {
  if (!dateString) return null;
  const ms = Date.now() - new Date(dateString).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function ProjectTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<"proposal" | "decided">("proposal");
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

  async function handleStatusChange(project: Project, next: string) {
    if (next === "good") {
      // 部門予算が未設定なら詳細ページへ誘導（autoGood=1 でステータスを自動セット）
      if (!project.departmentBudget) {
        alert("Goodにするには部門予算の入力が必要です。詳細ページで入力してください。");
        router.push(`/mypage/projects/${project.id}?autoGood=1`);
        return;
      }
      const ok = confirm("Goodにすると決定案件になります。確定しますか？");
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
      setProjects((list) => {
        if (tab === "proposal" && data.status === "good") {
          return list.filter((p) => p.id !== project.id);
        }
        if (tab === "decided" && data.status !== "good") {
          return list.filter((p) => p.id !== project.id);
        }
        return list.map((p) => (p.id === project.id ? data : p));
      });
    } catch (e) {
      setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, status: prev } : p)));
      const message = e instanceof Error ? e.message : "更新に失敗しました";
      alert(message);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.client && p.client.name !== filters.client) return false;
      if (filters.projectType && p.projectType !== filters.projectType) return false;
      if (tab === "proposal" && filters.certainty && p.certainty !== filters.certainty) return false;
      if (filters.businessContent && p.businessContent !== filters.businessContent) return false;
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
    const statusWeight = (s: string) => (s === "bad" ? 2 : s === "undecided" ? 1 : 0);
    if (!sortKey) {
      return list.sort((a, b) => {
        if (tab === "proposal") {
          const w = statusWeight(a.status) - statusWeight(b.status);
          if (w !== 0) return w;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "createdAt":
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
          break;
        case "status":
          av = a.status;
          bv = b.status;
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
        case "certainty":
          av = a.certainty;
          bv = b.certainty;
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
        case "proposalDate":
          av = a.proposalDate ? new Date(a.proposalDate).getTime() : -1;
          bv = b.proposalDate ? new Date(b.proposalDate).getTime() : -1;
          break;
        case "periodStart":
          av = a.periodStart ? new Date(a.periodStart).getTime() : -1;
          bv = b.periodStart ? new Date(b.periodStart).getTime() : -1;
          break;
        case "periodEnd":
          av = a.periodEnd ? new Date(a.periodEnd).getTime() : -1;
          bv = b.periodEnd ? new Date(b.periodEnd).getTime() : -1;
          break;
        case "note":
          av = a.note ?? "";
          bv = b.note ?? "";
          break;
        case "loadScore":
          av = avgAssigneeLoad(a);
          bv = avgAssigneeLoad(b);
          break;
        case "proposalEffortType":
          av = a.proposalEffortType ?? "";
          bv = b.proposalEffortType ?? "";
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
  }, [filtered, sortKey, sortDir, tab]);

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
    return {
      clients: uniq(projects.map((p) => p.client.name)),
      projectTypes: uniq(projects.map((p) => p.projectType)),
      certainties: uniq(projects.map((p) => p.certainty)),
      businessContents: uniq(projects.map((p) => p.businessContent)),
    };
  }, [projects]);

  const headers: { key: SortKey; label: string }[] = [
    { key: "createdAt", label: "追加日" },
    { key: "status", label: "Good/Bad" },
    { key: "client", label: "クライアント" },
    { key: "name", label: "案件名" },
    { key: "projectType", label: "種別" },
    ...(tab === "proposal" ? [{ key: "certainty", label: "確度" } as const] : []),
    { key: "businessContent", label: "業務内容" },
    ...(tab === "proposal" ? [{ key: "proposalEffortType", label: "提案タイプ" } as const] : []),
    ...(tab === "decided" ? [{ key: "loadScore", label: "負荷ラベル" } as const] : []),
    { key: "totalBudget", label: "全体予算" },
    { key: "departmentBudget", label: "部門予算" },
    ...(tab === "proposal" ? [{ key: "optionalAmount", label: "任意額" } as const] : []),
    ...(tab === "proposal" ? [{ key: "proposalDate", label: "提案日" } as const] : []),
    { key: "periodStart", label: "実施期間" },
    { key: "statusElapsedDays", label: "ステータス経過日数" },
    { key: "note", label: "備考" },
  ];

  return (
    <section className="rounded border border-stone-200 bg-white shadow-sm">
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setTab("proposal")}
          className={`px-4 py-3 text-sm font-medium ${tab === "proposal" ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500 hover:text-stone-700"}`}
        >
          提案案件一覧
        </button>
        <button
          type="button"
          onClick={() => setTab("decided")}
          className={`px-4 py-3 text-sm font-medium ${tab === "decided" ? "border-b-2 border-amber-600 text-amber-700" : "text-stone-500 hover:text-stone-700"}`}
        >
          決定案件一覧
        </button>
      </div>
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap gap-3 text-sm">
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
          {tab === "proposal" && (
            <label className="flex items-center gap-2">
              確度
              <select
                value={filters.certainty}
                onChange={(e) => setFilters((f) => ({ ...f, certainty: e.target.value }))}
                className="rounded border border-stone-300 bg-white px-2 py-1"
              >
                <option value="">全て</option>
                {filterOptions.certainties.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
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
            onClick={() => setFilters({ client: "", projectType: "", certainty: "", businessContent: "", periodStart: "", periodEnd: "" })}
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
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                {headers.map((h) => (
                  <th key={h.key} className="p-2">
                    <button
                      type="button"
                      onClick={() => toggleSort(h.key)}
                      className="inline-flex items-center gap-1 text-left hover:text-stone-900"
                      title="並び替え"
                    >
                      {h.label}
                      {sortKey === h.key && (
                        <span className="text-xs text-stone-500">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const load = avgAssigneeLoad(p);
                const period = [p.periodStart, p.periodEnd].filter(Boolean).map((d) => d && new Date(d).toLocaleDateString("ja")).join("〜");
                const elapsedDays = elapsedDaysFrom(p.statusUpdatedAt);
                const isStale = elapsedDays != null && elapsedDays >= 14;
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
                    <td className="p-2">{p.client.name}</td>
                    <td className="p-2">
                      <Link href={`/mypage/projects/${p.id}`} className="text-amber-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-2">{p.projectType}</td>
                    {tab === "proposal" && <td className="p-2">{p.certainty}</td>}
                    <td className="p-2">{p.businessContent}</td>
                    {tab === "proposal" && (
                      <td className="p-2">
                        {p.proposalEffortType && p.proposalEffortType in PROPOSAL_EFFORT_LABELS
                          ? PROPOSAL_EFFORT_LABELS[p.proposalEffortType as keyof typeof PROPOSAL_EFFORT_LABELS]
                          : "-"}
                      </td>
                    )}
                    {tab === "decided" && <td className="p-2">{getProjectLoadLabel(load)}</td>}
                    <td className="p-2">{p.totalBudget != null ? p.totalBudget.toLocaleString() : "-"}</td>
                    <td className="p-2">{p.departmentBudget != null ? p.departmentBudget.toLocaleString() : "-"}</td>
                    {tab === "proposal" && <td className="p-2">{p.optionalAmount != null ? p.optionalAmount.toLocaleString() : "-"}</td>}
                    {tab === "proposal" && <td className="p-2">{p.proposalDate ? new Date(p.proposalDate).toLocaleDateString("ja") : "-"}</td>}
                    <td className="p-2">{period || "-"}</td>
                    <td className="p-2">{elapsedDays != null ? `${elapsedDays}日` : "-"}</td>
                    <td className="max-w-[120px] truncate p-2" title={p.note ?? ""}>{p.note ?? "-"}</td>
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
