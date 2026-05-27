import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";

export const dynamic = "force-dynamic";
// after() necesita que la funcion siga viva hasta despues del debounce.
// 20s de sleep + buffer del fetch al worker entra holgado en este limite.
export const maxDuration = 60;

// Ventana de debounce en milisegundos. Si el usuario manda varios mensajes
// seguidos (estilo WhatsApp) dentro de esta ventana, todos se acumulan en
// el mismo job y el agente responde una sola vez al burst completo.
const DEBOUNCE_MS = 20_000;

// ===========================================================================
// POST /api/webhooks/incoming
//
// Webhook entrante. El panel le pega aca cuando el usuario manda un mensaje;
// la integracion de WhatsApp (Baileys) le pega con el mismo contrato. NO
// corre el agente: encola/extiende un job con debounce de 20s y devuelve
// 200 OK al toque. El worker (/api/jobs/process) lo procesa cuando expira
// el debounce.
//
// Acumulador de mensajes: si ya hay un job pending de la misma conversacion
// con process_at futuro, se EXTIENDE (no se crea uno nuevo). Asi varios
// mensajes seguidos del usuario se procesan en un solo turno del agente.
// ===========================================================================

const incomingSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(8000),
  source: z.enum(["panel", "whatsapp"]).default("panel"),
  externalId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = incomingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { conversationId, content } = parsed.data;
  const supabase = getSupabaseServerClient();

  // 1. Persistir el mensaje del usuario.
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content })
    .select("id")
    .single();

  if (msgErr || !message) {
    // 23503 = violacion de FK: la conversacion no existe.
    if (msgErr?.code === "23503") {
      return NextResponse.json({ error: "Conversacion inexistente" }, { status: 404 });
    }
    return NextResponse.json(
      { error: msgErr?.message ?? "No se pudo guardar el mensaje" },
      { status: 500 },
    );
  }

  // 2. Encolar / extender el job con debounce.
  //    Si ya hay un job pending para esta conversacion: extendemos su
  //    process_at (otro mensaje en la ventana = el agente lo va a procesar
  //    junto). Si no hay: creamos uno nuevo con process_at = now() + 20s.
  const nextProcessAt = new Date(Date.now() + DEBOUNCE_MS).toISOString();

  const { data: existing } = await supabase
    .from("agent_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();

  let jobId: string;
  if (existing) {
    const { error: updErr } = await supabase
      .from("agent_jobs")
      .update({ process_at: nextProcessAt })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    jobId = existing.id;
  } else {
    const { data: created, error: jobErr } = await supabase
      .from("agent_jobs")
      .insert({
        conversation_id: conversationId,
        user_message_id: message.id,
        status: "pending",
        process_at: nextProcessAt,
      })
      .select("id")
      .single();
    if (jobErr || !created) {
      return NextResponse.json(
        { error: jobErr?.message ?? "No se pudo encolar el job" },
        { status: 500 },
      );
    }
    jobId = created.id;
  }

  // 3. Bump de updated_at para reordenar la lista de conversaciones.
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  // 4. Notificar el evento a los webhooks salientes suscriptos.
  await dispatchEvent("message.received", {
    conversationId,
    messageId: message.id,
    content,
  });

  // 5. Auto-trigger demorado del worker. after() mantiene viva la funcion
  //    serverless hasta que termine. Dormimos el debounce y despues
  //    pegamos al worker: el primero que llegue al fin de la ventana sin
  //    que hayan llegado mas mensajes va a procesar el burst entero.
  //    Si otro mensaje extendio el process_at, este fetch llega antes de
  //    tiempo y el worker no claim nada — el after() del mensaje siguiente
  //    sera el que dispare. Si todos los after() vencen sin claim (caso
  //    extremo), el cron de Vercel lo levanta como fallback.
  after(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        fetch(`${req.nextUrl.origin}/api/jobs/process`, {
          method: "POST",
          headers: { "x-cron-secret": serverEnv().CRON_SECRET },
        })
          .catch(() => {
            // El cron lo levanta igual; no es critico si este disparo falla.
          })
          .finally(resolve);
      }, DEBOUNCE_MS);
    }),
  );

  // 6. 200 OK inmediato.
  return NextResponse.json({ messageId: message.id, jobId }, { status: 200 });
}
