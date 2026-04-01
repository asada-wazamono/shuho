"use client";

import { useState, useEffect } from "react";
import { ClientModal } from "./ClientModal";

type Client = { id: string; name: string };

export function ClientSelector() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const clientId = e.target.value;
    e.target.value = ""; // 選択後リセット
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (client) setSelectedClient(client);
  }

  return (
    <>
      <select
        onChange={handleSelect}
        defaultValue=""
        className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
      >
        <option value="" disabled>
          ＋ 新規案件
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

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
