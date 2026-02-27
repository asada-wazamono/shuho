"use client";

import { useState, useEffect } from "react";

type Client = { id: string; name: string; department: string | null; note: string | null };

export default function AdminClientsPage() {
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), department: department.trim() || null, note: note.trim() || null }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) alert(data.error);
        else {
          setName("");
          setDepartment("");
          setNote("");
          setShowForm(false);
          return fetch("/api/clients").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : []));
        }
      });
  }

  function handleDelete(id: string) {
    if (!confirm("削除（または無効化）しますか？")) return;
    fetch(`/api/clients/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then(() => fetch("/api/clients").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800">クライアント管理</h1>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          {showForm ? "キャンセル" : "新規追加"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-stone-600">クライアント名 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600">部門（任意）</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-stone-600">備考</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
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
                <th className="p-2">クライアント名</th>
                <th className="p-2">部門</th>
                <th className="p-2">備考</th>
                <th className="p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-stone-100">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.department ?? "-"}</td>
                  <td className="max-w-[200px] truncate p-2">{c.note ?? "-"}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      削除/無効化
                    </button>
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
