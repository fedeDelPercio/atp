"use client";

import toast from "react-hot-toast";
import { Trash2, Power } from "lucide-react";
import type { OutboundWebhook } from "@/lib/supabase/types";

// Lista de webhooks salientes con acciones (activar/desactivar, borrar).

export function WebhooksList({
  webhooks,
  onChanged,
}: {
  webhooks: OutboundWebhook[];
  onChanged: () => void;
}) {
  async function toggleActive(webhook: OutboundWebhook) {
    const res = await fetch(`/api/outbound-webhooks/${webhook.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !webhook.active }),
    });
    if (!res.ok) toast.error("No se pudo actualizar");
    onChanged();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/outbound-webhooks/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("No se pudo borrar");
    onChanged();
  }

  if (webhooks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
        No hay webhooks salientes configurados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <tr>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">URL</th>
            <th className="px-3 py-2">Eventos</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((w) => (
            <tr key={w.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="px-3 py-2 font-medium text-neutral-800 dark:text-neutral-200">
                {w.name}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2 text-neutral-500 dark:text-neutral-400">
                {w.url}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {w.events.map((e) => (
                    <span
                      key={e}
                      className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    w.active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {w.active ? "activo" : "inactivo"}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => toggleActive(w)}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    title={w.active ? "Desactivar" : "Activar"}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(w.id)}
                    className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/50"
                    title="Borrar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
