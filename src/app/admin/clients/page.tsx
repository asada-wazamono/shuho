"use client";

import { useState, useEffect } from "react";

type Client = { id: string; name: string; department: string | null; note: string | null };

export default function AdminClientsPage() {
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // 新規追加フォーム
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [note, setNote] = useState("");

  // インライン編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const r = await fetch("/api/clients");
    const d = await r.json();
    setList(Array.isArray(d) ? d : []);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  function startEdit(c: Client) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDepartment(c.department ?? "");
    setEditNote(c.note ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSave(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        department: editDepartment.trim() || null,
        note: editNote.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      alert(data.error);
    } else {
      setEditingId(null);
      await reload();
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), department: department.trim() || null, note: note.trim() || null }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else {
      setName("");
      setDepartment("");
      setNote("");
      setShowForm(false);
      await reload();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("削除（または無効化）しますか？")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800">クライアント管理</h1>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); setEditingId(null); }}
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
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-600">
                <th className="p-3">クライアント名</th>
                <th className="p-3">部門</th>
                <th className="p-3">備考</th>
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) =>
                editingId === c.id ? (
                  // 編集行
                  <tr key={c.id} className="border-b border-amber-100 bg-amber-50">
                    <td className="p-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border border-amber-300 px-2 py-1 text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editDepartment}
                        onChange={(e) => setEditDepartment(e.target.value)}
                        className="w-full rounded border border-amber-300 px-2 py-1 text-sm"
                        placeholder="任意"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="w-full rounded border border-amber-300 px-2 py-1 text-sm"
                        placeholder="任意"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => handleSave(c.id)}
                          disabled={saving || !editName.trim()}
                          className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-50"
                        >
                          {saving ? "保存中…" : "保存"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-sm text-stone-500 hover:underline"
                        >
                          キャンセル
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // 通常行
                  <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-3 font-medium text-stone-800">{c.name}</td>
                    <td className="p-3 text-stone-600">{c.department ?? "-"}</td>
                    <td className="max-w-[220px] truncate p-3 text-stone-600">{c.note ?? "-"}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          type="button"
                          onClick={() => { setShowForm(false); startEdit(c); }}
                          className="text-sm text-amber-700 hover:underline"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          削除/無効化
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-stone-400">
                    クライアントがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
