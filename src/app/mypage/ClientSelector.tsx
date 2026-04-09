"use client";

import { useState, useEffect } from "react";
import { ClientModal } from "./ClientModal";

type Client = { id: string; name: string };

const NEW_CLIENT_VALUE = "__new__";

export function ClientSelector() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  // 新規クライアント登録モーダル
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDept, setNewClientDept] = useState("");
  const [newClientNote, setNewClientNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchClients();
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  function fetchClients() {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    e.target.value = "";
    if (!value) return;
    if (value === NEW_CLIENT_VALUE) {
      setShowNewClient(true);
      return;
    }
    const client = clients.find((c) => c.id === value);
    if (client) setSelectedClient(client);
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newClientName.trim()) { setError("クライアント名は必須です"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName.trim(), department: newClientDept || null, note: newClientNote || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登録に失敗しました");
      fetchClients();
      setShowNewClient(false);
      setNewClientName("");
      setNewClientDept("");
      setNewClientNote("");
      // 作成したクライアントのモーダルをそのまま開く
      setSelectedClient({ id: data.id, name: data.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <select
        onChange={handleSelect}
        defaultValue=""
        className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
      >
        <option value="" disabled>＋ 新規案件</option>
        <option value={NEW_CLIENT_VALUE}>＋ 新規クライアントを作成</option>
        <optgroup label="既存クライアント">
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      </select>

      {/* 新規クライアント登録モーダル */}
      {showNewClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewClient(false); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="text-base font-bold text-stone-800">新規クライアントを登録</h2>
              <button type="button" onClick={() => setShowNewClient(false)} className="rounded p-1 text-stone-400 hover:bg-stone-100">✕</button>
            </div>
            <form onSubmit={handleCreateClient} className="space-y-4 px-6 py-5">
              {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">クライアント名 *</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="例：株式会社〇〇"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">部署名</label>
                <input
                  type="text"
                  value={newClientDept}
                  onChange={(e) => setNewClientDept(e.target.value)}
                  placeholder="例：マーケティング部"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">メモ</label>
                <textarea
                  value={newClientNote}
                  onChange={(e) => setNewClientNote(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-3 border-t border-stone-200 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {saving ? "登録中…" : "登録"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewClient(false)}
                  className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedClient && (
        <ClientModal
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          sessionUserId={sessionUserId}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </>
  );
}
