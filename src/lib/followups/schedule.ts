import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { clientEnv } from "@/lib/env";

// ===========================================================================
// Helpers para el ciclo de seguimientos manuales.
//
// - scheduleFirstFollowup: se llama cuando un lead pasa por primera vez a
//   status=contactado. Consulta la regla activa para la temperatura del
//   lead y crea el primer lead_followups con due_at calculado.
//
// - scheduleRecurringFollowup: se llama cuando un follow-up existente se
//   marca como completado. Crea el siguiente con la periodica.
//
// - cancelPendingFollowups: cuando el lead pasa a cerrado/descartado, no
//   borramos historial (queremos ver los que hubo) pero eliminamos los
//   pendientes para que no aparezcan en la campanita.
//
// Todas las funciones son best-effort: si la regla esta deshabilitada, no
// hay lead o la DB devuelve error, loggeamos y seguimos. Nunca deben
// romper el flow principal del panel.
// ===========================================================================

type Temperatura = "frio" | "tibio" | "caliente";

function daysToIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function getRule(
  temperatura: Temperatura,
): Promise<{ first_interval_days: number; recurring_interval_days: number; enabled: boolean } | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("follow_up_rules")
    .select("first_interval_days, recurring_interval_days, enabled")
    .eq("client_slug", clientEnv.NEXT_PUBLIC_CLIENT_SLUG)
    .eq("temperatura", temperatura)
    .maybeSingle();
  if (error) {
    console.error("[followups] no se pudo leer follow_up_rules:", error);
    return null;
  }
  return data ?? null;
}

async function getLeadTemperatura(leadId: string): Promise<Temperatura | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("temperatura")
    .eq("id", leadId)
    .maybeSingle();
  const t = data?.temperatura;
  if (t === "frio" || t === "tibio" || t === "caliente") return t;
  return null;
}

export async function scheduleFirstFollowup(leadId: string): Promise<void> {
  try {
    const temperatura = await getLeadTemperatura(leadId);
    if (!temperatura) return;

    const rule = await getRule(temperatura);
    if (!rule || !rule.enabled) return;

    const supabase = getSupabaseServerClient();

    // Idempotencia: si el lead ya tiene un follow-up 'first' (pending o
    // completado), no creamos otro. Puede pasar si el vendedor toggle a
    // contactado -> nuevo -> contactado.
    const { data: existing } = await supabase
      .from("lead_followups")
      .select("id")
      .eq("lead_id", leadId)
      .eq("kind", "first")
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase.from("lead_followups").insert({
      lead_id: leadId,
      kind: "first",
      due_at: daysToIso(rule.first_interval_days),
    });
    if (error) {
      console.error("[followups] no se pudo crear el primer follow-up:", error);
    }
  } catch (err) {
    console.error("[followups] scheduleFirstFollowup fallo:", err);
  }
}

export async function scheduleRecurringFollowup(leadId: string): Promise<void> {
  try {
    const temperatura = await getLeadTemperatura(leadId);
    if (!temperatura) return;

    const rule = await getRule(temperatura);
    if (!rule || !rule.enabled) return;

    // No creamos siguiente si el lead esta cerrado / descartado.
    const supabase = getSupabaseServerClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;
    if (lead.status === "cerrado" || lead.status === "descartado") return;

    const { error } = await supabase.from("lead_followups").insert({
      lead_id: leadId,
      kind: "recurring",
      due_at: daysToIso(rule.recurring_interval_days),
    });
    if (error) {
      console.error("[followups] no se pudo crear el follow-up recurring:", error);
    }
  } catch (err) {
    console.error("[followups] scheduleRecurringFollowup fallo:", err);
  }
}

export async function cancelPendingFollowups(leadId: string): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("lead_followups")
      .delete()
      .eq("lead_id", leadId)
      .is("completed_at", null);
    if (error) {
      console.error("[followups] no se pudieron cancelar los pendientes:", error);
    }
  } catch (err) {
    console.error("[followups] cancelPendingFollowups fallo:", err);
  }
}
