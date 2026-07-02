"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ClipboardList, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useProfile } from "./ProfileProvider";

// ===========================================================================
// Seccion "Seguimientos" del modal del lead.
//
// Muestra el historial de seguimientos manuales del lead:
//   - Pendiente (0 o 1): con due_at, input de notas y boton "Marcar hecho".
//   - Completados: en orden desc con quien y cuando, mas la nota.
//
// Al marcar como hecho, el backend genera automaticamente el siguiente
// pendiente segun la regla (recurring_interval_days). Refetcheamos para
// reflejar el nuevo pendiente sin cerrar el modal.
// ===========================================================================

interface Followup {
  id: string;
  lead_id: string;
  kind: "first" | "recurring";
  due_at: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  leadId: string;
}

export function FollowupsSection({ leadId }: Props) {
  const { profile } = useProfile();
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/lead-followups?lead_id=${encodeURIComponent(leadId)}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw new Error("fetch failed");
      const json = (await r.json()) as { followups: Followup[] };
      setItems(json.followups ?? []);
    } catch {
      toast.error("No se pudieron cargar los seguimientos");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const pending = items.find((f) => !f.completed_at) ?? null;
  const completed = items.filter((f) => f.completed_at);

  async function markDone(followupId: string) {
    setSaving(true);
    try {
      const r = await fetch(`/api/lead-followups/${followupId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          completed_by: profile?.id ?? null,
        }),
      });
      if (!r.ok) throw new Error("patch failed");
      setNotes("");
      await fetchItems();
      toast.success("Seguimiento marcado como hecho");
    } catch {
      toast.error("No se pudo marcar como hecho");
    } finally {
      setSaving(false);
    }
  }

  async function cancelPending(followupId: string) {
    setSaving(true);
    try {
      const r = await fetch(`/api/lead-followups/${followupId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("delete failed");
      await fetchItems();
      toast.success("Seguimiento cancelado");
    } catch {
      toast.error("No se pudo cancelar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <ClipboardList
          className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400"
          strokeWidth={1.75}
        />
        <p className="text-[11.5px] font-medium text-neutral-700 dark:text-neutral-300">
          Seguimientos
        </p>
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          {items.length} {items.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-200 px-3 py-3 text-[12px] leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
          Todavía no hay seguimientos. Cuando el lead pase a{" "}
          <span className="font-medium">Contactado</span>, se va a crear el
          primer seguimiento automáticamente según la regla configurada.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pending && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900/40">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <CalendarClock
                  className="h-3 w-3 text-warn"
                  strokeWidth={1.75}
                />
                <span className="text-[12px] font-medium text-neutral-800 dark:text-neutral-200">
                  Pendiente
                </span>
                <span
                  className={`font-mono text-[10.5px] uppercase tracking-wide ${
                    isOverdue(pending.due_at)
                      ? "text-red-600 dark:text-red-500"
                      : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {relativeDueLabel(pending.due_at)}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  · {pending.kind === "first" ? "1er contacto" : "recurrente"}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observaciones del seguimiento..."
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => void cancelPending(pending.id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                  Cancelar
                </button>
                <button
                  onClick={() => void markDone(pending.id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <Check className="h-3 w-3" strokeWidth={2} />
                  )}
                  Marcar como hecho
                </button>
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {completed.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/40"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Check
                      className="h-3 w-3 text-ok"
                      strokeWidth={2}
                    />
                    <span className="text-[12px] text-neutral-700 dark:text-neutral-300">
                      Contactado
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                      {f.completed_at ? formatShort(f.completed_at) : ""}
                      {" · "}
                      {f.kind === "first" ? "1er contacto" : "recurrente"}
                    </span>
                  </div>
                  {f.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {f.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

function relativeDueLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const totalHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffMs <= 0) {
    const overdueHours = -totalHours;
    if (overdueHours < 24) return `Vencido hace ${overdueHours}h`;
    return `Vencido hace ${Math.round(overdueHours / 24)}d`;
  }
  if (totalHours < 24) return `En ${totalHours}h`;
  return `En ${Math.round(totalHours / 24)}d`;
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
