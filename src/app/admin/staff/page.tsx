"use client";

import { useState, useEffect } from "react";
import { DEPARTMENTS } from "@/lib/constants";

type Staff = {
  id: string;
  loginId: string;
  name: string;
  email: string;
  department: string;
  role: string;
};

export default function AdminStaffPage() {
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState<{
    password: string;
    name: string;
    email: string;
    department: string;
    role: string;
  }>({
    password: "",
    name: "",
    email: "",
    department: DEPARTMENTS[0],
    role: "staff",
  });
  const [resetPassId, setResetPassId] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/staff")
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) alert(data.error);
        else {
          setNewUser({ password: "", name: "", email: "", department: DEPARTMENTS[0] as string, role: "staff" });
          setShowForm(false);
          return fetch("/api/admin/staff").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : []));
        }
      });
  }

  function handleCsvTemplate() {
    const csv = "password,name,email,department,role\npassword1,山田 太郎,yamada@example.com,1DCD,staff\npassword2,佐藤 花子,sato@example.com,2DCD,staff";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await fetch("/api/admin/staff/csv", { method: "POST", body: form });
      const contentType = r.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await r.json()
        : { error: (await r.text()) || "不明なエラーが発生しました" };
      if (!r.ok) throw new Error(data?.error || "CSV取り込みに失敗しました");

      if (data.error) alert(data.error);
      else {
        alert(`${data.created}件追加しました。${data.errors?.length ? "\n" + data.errors.join("\n") : ""}`);
        fetch("/api/admin/staff").then((r2) => r2.json()).then((d) => setList(Array.isArray(d) ? d : []));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "CSV取り込みに失敗しました";
      alert(message);
    } finally {
      setCsvLoading(false);
      e.target.value = "";
    }
  }

  function handleDeleteAllStaff() {
    if (!confirm("部員（管理者以外）を全員削除します。よろしいですか？")) return;
    fetch("/api/admin/staff/delete-all-staff", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) alert(data.error);
        else {
          alert(`${data.deleted}件の部員を削除しました。`);
          fetch("/api/admin/staff").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : []));
        }
      });
  }

  function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`「${email}」を削除しますか？`)) return;
    fetch(`/api/admin/staff/${userId}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) alert(data.error);
        else fetch("/api/admin/staff").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : []));
      });
  }

  function handleResetPassword(userId: string) {
    if (!resetPass.trim()) return;
    fetch(`/api/admin/staff/${userId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPass }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setResetPassId(null);
          setResetPass("");
        } else alert(data.error || "失敗");
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-stone-800">部員管理</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCsvTemplate}
            className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100"
          >
            CSVテンプレDL
          </button>
          <label className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100 cursor-pointer">
            {csvLoading ? "取り込み中…" : "CSV取り込み"}
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={csvLoading} />
          </label>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            {showForm ? "キャンセル" : "新規部員追加"}
          </button>
          <button
            type="button"
            onClick={handleDeleteAllStaff}
            className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            部員を全削除
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">新規部員</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-stone-600">メールアドレス *（ログインに使用）</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">パスワード *</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">氏名 *</label>
              <input
                value={newUser.name}
                onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">部署</label>
              <select
                value={newUser.department}
                onChange={(e) => setNewUser((u) => ({ ...u, department: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">権限</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                <option value="staff">部員</option>
                <option value="admin">管理者</option>
              </select>
            </div>
          </div>
          <button type="submit" className="mt-4 rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700">
            追加
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-stone-500">読み込み中…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="p-2">権限</th>
                <th className="p-2">部署</th>
                <th className="p-2">氏名</th>
                <th className="p-2">メール</th>
                <th className="p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-stone-100">
                  <td className="p-2">{u.role === "admin" ? "管理者" : "部員"}</td>
                  <td className="p-2">{u.department}</td>
                  <td className="p-2">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {resetPassId === u.id ? (
                        <>
                          <input
                            type="password"
                            placeholder="新パスワード"
                            value={resetPass}
                            onChange={(e) => setResetPass(e.target.value)}
                            className="w-32 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u.id)}
                            className="text-sm text-amber-700 hover:underline"
                          >
                            再発行
                          </button>
                          <button type="button" onClick={() => setResetPassId(null)} className="text-sm text-stone-500">
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setResetPassId(u.id)}
                          className="text-sm text-amber-700 hover:underline"
                        >
                          パスワード再発行
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        削除
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
