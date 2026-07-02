import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/notifications
//
// Devuelve la data que consume la campanita del header:
//  - count: cantidad total de seguimientos vencidos (leads activos)
//  - items: primeros 20 leads con seguimiento vencido, priorizados por
//    temperatura (caliente > tibio > frio) y dentro de la misma
//    temperatura por due_at ascendente (los mas viejos arriba).
//
// "Vencido" = due_at <= now() AND completed_at IS NULL.
// "Lead activo" = status NOT IN ('cerrado', 'descartado').
// ===========================================================================

interface FollowupRow {
  id: string;
  lead_id: string;
  due_at: string;
  kind: string;
  leads: {
    id: string;
    name: string | null;
    temperatura: string | null;
    status: string | null;
    conversation_id: string;
  } | null;
}

const TEMP_PRIORITY: Record<string, number> = {
  caliente: 0,
  tibio: 1,
  frio: 2,
};

export async function GET() {
  const supabase = getSupabaseServerClient();

  const nowIso = new Date().toISOString();

  // Traemos hasta 100 candidatos con el join al lead; despues filtramos y
  // ordenamos en JS por prioridad de temperatura + due_at.
  const { data, error } = await supabase
    .from("lead_followups")
    .select(
      `id, lead_id, due_at, kind,
       leads (id, name, temperatura, status, conversation_id)`,
    )
    .is("completed_at", null)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as FollowupRow[];

  // Filtro: descartar los que no tienen lead o el lead esta cerrado.
  const active = rows.filter((r) => {
    const lead = r.leads;
    if (!lead) return false;
    if (lead.status === "cerrado" || lead.status === "descartado") return false;
    return true;
  });

  // Orden final: por prioridad de temperatura, luego due_at asc.
  active.sort((a, b) => {
    const pa = TEMP_PRIORITY[a.leads?.temperatura ?? "frio"] ?? 9;
    const pb = TEMP_PRIORITY[b.leads?.temperatura ?? "frio"] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.due_at.localeCompare(b.due_at);
  });

  const items = active.slice(0, 20).map((r) => ({
    followup_id: r.id,
    lead_id: r.lead_id,
    conversation_id: r.leads?.conversation_id ?? null,
    name: r.leads?.name ?? "Sin nombre",
    temperatura: r.leads?.temperatura ?? null,
    status: r.leads?.status ?? null,
    due_at: r.due_at,
    kind: r.kind,
  }));

  return NextResponse.json({
    count: active.length,
    items,
  });
}
