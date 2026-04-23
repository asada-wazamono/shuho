"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { AdminProjectList } from "./AdminProjectList";
import { AdminAIChat } from "./AdminAIChat";

function ExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) throw new Error("取得に失敗しました");
      const rows = await res.json();

      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ["種別", "担当部署", "クライアント", "案件名", "子案件名", "全体予算", "部門予算", "実施開始", "実施終了", "担当者"],
      });

      // 列幅を設定
      ws["!cols"] = [
        { wch: 6 },  // 種別
        { wch: 10 }, // 担当部署
        { wch: 20 }, // クライアント
        { wch: 30 }, // 案件名
        { wch: 30 }, // 子案件名
        { wch: 12 }, // 全体予算
        { wch: 12 }, // 部門予算
        { wch: 12 }, // 実施開始
        { wch: 12 }, // 実施終了
        { wch: 25 }, // 担当者
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "案件一覧");

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `案件一覧_${date}.xlsx`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
    >
      {loading ? "作成中…" : "📥 Excelで出力"}
    </button>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <AdminAIChat />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800">案件一覧（管理者）</h1>
        <ExportButton />
      </div>
      <AdminProjectList />
    </div>
  );
}
