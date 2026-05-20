"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OutboundWebhookDelivery } from "@/lib/supabase/types";

// Tabla de las ultimas entregas de webhooks salientes (debugging).

export function DeliveriesTable() {
  const [deliveries, setDeliveries] = useState<OutboundWebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await getSupabaseBrowserClient()
      .from("outbound_webhook_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setDeliveries(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function statusColor(status: number | null): string {
    if (status === null) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    if (status >= 200 && status < 300)
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Últimas entregas
        </h3>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {deliveries.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
            Sin entregas registradas todavía.
          </p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              <tr>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">Respuesta</th>
                <th className="px-3 py-2">Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">
                    {d.event}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusColor(d.response_status)}`}
                    >
                      {d.response_status ?? "error"}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-neutral-400 dark:text-neutral-500">
                    {d.response_body ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-400 dark:text-neutral-500">
                    {formatDistanceToNow(new Date(d.created_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
