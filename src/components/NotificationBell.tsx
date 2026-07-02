"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { TEMPERATURA_DOT } from "@/lib/leads/labels";
import type { LeadTemperatura } from "@/lib/supabase/types";

// ===========================================================================
// Campanita de notificaciones del header.
//
// Muestra el conteo de seguimientos manuales vencidos y, al abrir, lista
// los primeros 20 ordenados por prioridad (caliente > tibio > frio, luego
// due_at ascendente). Cada item linkea a /leads?open=<id> que abre el
// modal del lead automaticamente.
//
// Polling cada 60s + refetch al cerrar el dropdown (para que el badge se
// actualice apenas el vendedor marca un follow-up como hecho).
// ===========================================================================

const POLL_MS = 60_000;

interface NotificationItem {
  followup_id: string;
  lead_id: string;
  conversation_id: string | null;
  name: string;
  temperatura: LeadTemperatura | null;
  status: string | null;
  due_at: string;
  kind: string;
}

interface NotificationsResponse {
  count: number;
  items: NotificationItem[];
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const inFlight = useRef(false);

  const fetchData = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) throw new Error("fetch failed");
      const json = (await r.json()) as NotificationsResponse;
      setCount(json.count ?? 0);
      setItems(json.items ?? []);
    } catch {
      // Silencioso: la campanita no bloquea el flujo.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Al cerrar el dropdown re-fetcheamos: el vendedor pudo haber marcado
  // un seguimiento hecho desde otra tab.
  useEffect(() => {
    if (!open) void fetchData();
  }, [open, fetchData]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-lg p-1.5 transition hover:bg-neutral-100 dark:hover:bg-neutral-900"
        aria-label={`Notificaciones${count > 0 ? ` (${count})` : ""}`}
      >
        <Bell
          className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
          strokeWidth={1.75}
        />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-[60] mt-2 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark">
            <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
              <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                Seguimientos pendientes
              </p>
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {count} {count === 1 ? "vencido" : "vencidos"}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-8 text-center">
                <Bell
                  className="h-5 w-5 text-neutral-300 dark:text-neutral-700"
                  strokeWidth={1.5}
                />
                <p className="text-[12px] text-neutral-500 dark:text-neutral-500">
                  Nada pendiente por ahora
                </p>
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((it) => (
                  <li key={it.followup_id}>
                    <Link
                      href={`/leads?open=${it.lead_id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 px-3 py-2.5 text-[12px] transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    >
                      {it.temperatura ? (
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TEMPERATURA_DOT[it.temperatura]}`}
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                          {it.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                          {overdueLabel(it.due_at)}
                          {it.kind === "first" ? " · 1er contacto" : " · recurrente"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-neutral-100 dark:border-neutral-800">
              <Link
                href="/leads"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] text-neutral-600 transition hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
              >
                Ver todos los leads
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function overdueLabel(dueAtIso: string): string {
  const diffMs = Date.now() - new Date(dueAtIso).getTime();
  if (diffMs < 0) {
    const h = Math.round(-diffMs / (1000 * 60 * 60));
    return `en ${h}h`;
  }
  const totalHours = Math.round(diffMs / (1000 * 60 * 60));
  if (totalHours < 24) return `vencido hace ${totalHours}h`;
  const days = Math.round(totalHours / 24);
  return `vencido hace ${days}d`;
}
