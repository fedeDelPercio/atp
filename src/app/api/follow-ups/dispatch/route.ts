import { NextRequest, NextResponse } from "next/server";
import { clientEnv, serverEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ===========================================================================
// POST /api/follow-ups/dispatch
//
// Worker periodico de follow-ups. Lo dispara el cron de Vercel cada 1 min.
//
// Para cada conversacion elegible (ver criterios en la RPC
// find_followup_candidates) mete UN unico mensaje de seguimiento (texto
// fijo de FOLLOW_UP_TEXT) y la marca con follow_up_sent_at = now() para
// que no se vuelva a procesar.
//
// Si la conversacion es de WhatsApp, ademas encolamos el texto en wa_outbox
// para que el bot Baileys lo entregue al lead. En conversaciones de test
// (source='test') el mensaje queda solo en el panel.
//
// El kill-switch FOLLOW_UP_ENABLED gobierna si efectivamente despacha o
// solo loggea cuantos candidatos hay (modo dry-run util para validar
// criterios sin mandar mensajes).
// ===========================================================================

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = serverEnv().CRON_SECRET;
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}

interface FollowupCandidate {
  conversation_id: string;
  source: string;
  external_id: string | null;
  wa_jid: string | null;
  last_assistant_at: string;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const env = serverEnv();
  const supabase = getSupabaseServerClient();

  const sources = env.FOLLOW_UP_SOURCES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (sources.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no-sources" });
  }

  const { data: rawCandidates, error: rpcErr } = await supabase.rpc(
    "find_followup_candidates",
    {
      p_delay_ms: env.FOLLOW_UP_DELAY_MS,
      p_sources: sources,
      p_client_slug: clientEnv.NEXT_PUBLIC_CLIENT_SLUG,
    },
  );

  if (rpcErr) {
    console.error("[follow-ups] RPC fallo:", rpcErr);
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const candidates = (rawCandidates ?? []) as FollowupCandidate[];

  if (!env.FOLLOW_UP_ENABLED) {
    if (candidates.length > 0) {
      console.log(
        `[follow-ups] disabled. ${candidates.length} candidato(s) detectado(s) (dry run).`,
      );
    }
    return NextResponse.json({
      enabled: false,
      candidates: candidates.length,
      dispatched: 0,
    });
  }

  let dispatched = 0;
  const failed: string[] = [];

  for (const cand of candidates) {
    const ok = await dispatchOne(cand, env.FOLLOW_UP_TEXT);
    if (ok) dispatched++;
    else failed.push(cand.conversation_id);
  }

  console.log(
    `[follow-ups] candidatos=${candidates.length} despachados=${dispatched} fallidos=${failed.length}`,
  );

  return NextResponse.json({
    enabled: true,
    candidates: candidates.length,
    dispatched,
    failed,
  });
}

/**
 * Manda el follow-up a una conversacion. Es defensivo: si algun paso falla,
 * abandona la candidata sin marcar follow_up_sent_at (asi el proximo tick
 * la vuelve a intentar). El orden importa:
 *  1. Insertar el message (visible en el panel).
 *  2. Encolar en wa_outbox si source='whatsapp' (entrega externa).
 *  3. Marcar follow_up_sent_at (cierra el caso para esta conv).
 */
async function dispatchOne(
  cand: FollowupCandidate,
  text: string,
): Promise<boolean> {
  const supabase = getSupabaseServerClient();

  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: cand.conversation_id,
    role: "assistant",
    content: text,
  });
  if (msgErr) {
    console.error(
      `[follow-ups] no se pudo insertar message en conv ${cand.conversation_id}:`,
      msgErr,
    );
    return false;
  }

  if (cand.source === "whatsapp") {
    const outboxPhone = cand.wa_jid ?? cand.external_id;
    if (!outboxPhone) {
      console.error(
        `[follow-ups] conv ${cand.conversation_id} es whatsapp pero sin phone/jid, abandono`,
      );
      return false;
    }
    const { error: outboxErr } = await supabase.from("wa_outbox").insert({
      conversation_id: cand.conversation_id,
      phone: outboxPhone,
      content: text,
    });
    if (outboxErr) {
      console.error(
        `[follow-ups] no se pudo encolar en wa_outbox para conv ${cand.conversation_id}:`,
        outboxErr,
      );
      return false;
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("conversations")
    .update({ follow_up_sent_at: nowIso, updated_at: nowIso })
    .eq("id", cand.conversation_id);
  if (updateErr) {
    console.error(
      `[follow-ups] no se pudo marcar follow_up_sent_at en conv ${cand.conversation_id}:`,
      updateErr,
    );
    return false;
  }

  return true;
}
