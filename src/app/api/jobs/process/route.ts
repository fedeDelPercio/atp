import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { runAgent } from "@/lib/agent/run";
import { testProvider } from "@/lib/providers/test-provider";
import {
  setContactTextFields,
  launchSalesbot,
  KommoApiError,
  KommoConfigError,
} from "@/lib/kommo/client";
import { KOMMO_CONTACT_FIELDS_RESPUESTA_IA } from "@/lib/kommo/mapping";
import type { HistoryMessage } from "@/lib/agent/types";
import type { AgentJob } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
// El worker puede tardar: corre el agente completo. Vercel necesita el límite.
export const maxDuration = 300;

// ===========================================================================
// POST /api/jobs/process
//
// Worker de jobs. Lo dispara el cron de Vercel (cada minuto) o el auto-trigger
// del webhook entrante. Reclama hasta 5 jobs pending de forma atómica y corre
// el agente para cada uno. Protegido por CRON_SECRET (en dev se permite sin
// secret para el botón "Procesar ahora").
// ===========================================================================

const BATCH_SIZE = 5;
// Maximo de mensajes previos que se le pasan al orquestador como history.
// Mas history = mas contexto pero tambien mas tokens. 10 cubre conversaciones
// realistas (saludo + 4-5 idas y vueltas de descubrimiento) sin inflar el
// prompt en conversaciones muy largas.
const HISTORY_LIMIT = 10;

// Etiquetas legibles para las categorías comunes (cada cliente puede sumar
// las suyas en su rama). Cualquier otra categoría se humaniza automáticamente
// con `humanizeCategory()`.
const COMMON_CATEGORY_LABEL: Record<string, string> = {
  interes_compra: "Interés de compra",
  cliente_existente: "Cliente existente",
  fuera_de_conocimiento: "Consulta fuera de la base de conocimiento",
  escalado_manual: "Escalado manual",
  falla_tecnica: "Falla técnica",
};

/** Convierte una categoría snake_case en un texto legible para el cartel. */
function humanizeCategory(category: string): string {
  const known = COMMON_CATEGORY_LABEL[category];
  if (known) return known;
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = serverEnv().CRON_SECRET;
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data: jobs, error } = await supabase.rpc("claim_agent_jobs", {
    p_limit: BATCH_SIZE,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!jobs || jobs.length === 0) return NextResponse.json({ processed: 0 });

  let processed = 0;
  let failed = 0;
  // Secuencial: evita levantar varias sesiones del Agent SDK en paralelo.
  for (const job of jobs) {
    try {
      await processJob(job);
      processed++;
    } catch (err) {
      await handleJobFailure(job, err);
      failed++;
    }
  }

  return NextResponse.json({ claimed: jobs.length, processed, failed });
}

/** Procesa un job: corre el agente y persiste la respuesta. */
async function processJob(job: AgentJob): Promise<void> {
  const supabase = getSupabaseServerClient();

  // Freeze guard: el agente se calla SOLO si un asesor humano tomó el
  // control de la conversación (modo HUMAN). Una notificación al equipo por
  // sí sola NO congela: el agente sigue respondiendo lo que la KB cubre
  // hasta que una persona tome la conversación manualmente desde el panel.
  // (Antes congelábamos ante cualquier notificación, lo que dejaba al
  // cliente sin respuesta apenas se derivaba — ej. tras interes_compra.)
  const { data: convState } = await supabase
    .from("conversations")
    .select("mode")
    .eq("id", job.conversation_id)
    .maybeSingle();

  if (convState?.mode === "HUMAN") {
    await supabase
      .from("agent_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error: "Conversación en modo humano: la atiende un asesor.",
      })
      .eq("id", job.id);
    return;
  }

  // BATCH: agarrar TODOS los mensajes user "pendientes" de la conversation,
  // es decir, los que llegaron después de la última respuesta del assistant.
  // Esto soporta el debounce: si el lead mandó varios mensajes seguidos
  // (texto + audio + texto) y reseteamos el timer cada vez, ahora los
  // procesamos todos juntos como un solo turno.
  const { data: allMsgs } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", job.conversation_id)
    .order("created_at", { ascending: true });
  const msgs = allMsgs ?? [];

  // Cutoff = created_at del último assistant message. Los user messages
  // posteriores a ese cutoff son los "pendientes a procesar".
  const lastAssistantIdx = findLastIndex(
    msgs,
    (m) => m.role === "assistant" || m.role === "human",
  );
  const cutoffIdx = lastAssistantIdx >= 0 ? lastAssistantIdx : -1;
  const pendingUserMsgs = msgs
    .slice(cutoffIdx + 1)
    .filter((m) => m.role === "user");

  if (pendingUserMsgs.length === 0) {
    // Edge case: el job estaba pendiente pero ya no hay user msgs sin
    // responder. Marcamos completed y salimos.
    await supabase
      .from("agent_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error: "Sin mensajes pendientes (probable race con otro worker).",
      })
      .eq("id", job.id);
    return;
  }

  // Combinar los mensajes pendientes en un solo "userMessage". Si hay
  // más de uno, los unimos con doble salto de línea para que el agente
  // los vea como ráfagas de la misma persona.
  const userMessage = pendingUserMsgs.map((m) => m.content).join("\n\n");

  // Historial = todo lo previo al primer pendiente, limitado a HISTORY_LIMIT.
  const firstPendingIdx = msgs.findIndex((m) => m.id === pendingUserMsgs[0]?.id);
  const historyMsgs = msgs.slice(0, firstPendingIdx);
  const history: HistoryMessage[] = historyMsgs
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role as HistoryMessage["role"], content: m.content }));

  // userMessageId del trace = el último user message (el que disparó el
  // último reset del debounce).
  const triggerMsgId = pendingUserMsgs[pendingUserMsgs.length - 1]?.id ?? job.user_message_id;

  const result = await runAgent({
    conversationId: job.conversation_id,
    userMessageId: triggerMsgId,
    userMessage,
    history,
  });

  // El agente puede devolver varios mensajes cortos separados por una línea
  // con "---" (estilo mensajería). Se insertan como burbujas separadas.
  // Si assistantMessage viene vacío (caso típico: derivación a humano sin
  // respuesta al lead) NO se inserta ninguna burbuja del asistente — el
  // cartel de notificación (más abajo) es la única señal visible.
  const segments = result.assistantMessage
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let lastMessageId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    const { data: msg } = await supabase
      .from("messages")
      .insert({
        conversation_id: job.conversation_id,
        role: "assistant",
        content: segments[i] ?? "",
        // Solo el último mensaje del turno lleva el trace.
        trace_id: isLast ? result.traceId : null,
      })
      .select("id")
      .single();
    if (isLast && msg) lastMessageId = msg.id;
  }

  if (lastMessageId) {
    await supabase
      .from("agent_traces")
      .update({ assistant_message_id: lastMessageId })
      .eq("id", result.traceId);
  }

  // Si hubo notificación NUEVA, se inserta un "cartel" de sistema visible en
  // el panel. Si la conversación ya tenía una notificación de la misma
  // categoría (escalationIsNew === false), no repetimos el cartel: el agente
  // sigue conversando tras derivar y no queremos duplicar el aviso.
  // Mensaje sobrio (sin emoji, sin caps, sin em dash). El render le agrega el
  // ícono y la chip — ver MessageBubble role==="system".
  if (
    (result.status === "escalated" || result.status === "failed") &&
    result.escalationIsNew !== false
  ) {
    const label = humanizeCategory(result.escalationReason ?? "Notificación");
    await supabase.from("messages").insert({
      conversation_id: job.conversation_id,
      role: "system",
      content: `Derivado al equipo: ${label}`,
    });
  }

  // Reordenar la conversación.
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", job.conversation_id);

  // Entrega externa del canal (no-op en el provider de test).
  await testProvider.sendMessage(job.conversation_id, result.assistantMessage);

  // KOMMO sync: si la conversation es de WhatsApp via Kommo (tiene
  // kommo_contact_id), seteamos los custom fields con la respuesta del
  // agente partida en hasta 3 burbujas y lanzamos el bot, que tiene 3
  // steps Mensaje con condicional "field no vacío" para el 2do y 3ro.
  // Los fields no usados van como "" para limpiar restos del turno
  // anterior (sin esto, una respuesta vieja de 3 burbujas seguida de
  // una de 1 dispararía burbujas fantasma).
  if (result.assistantMessage.trim()) {
    const { data: convInfo } = await supabase
      .from("conversations")
      .select("source, kommo_contact_id, kommo_lead_id")
      .eq("id", job.conversation_id)
      .maybeSingle();
    if (
      convInfo?.source === "whatsapp" &&
      convInfo.kommo_contact_id &&
      convInfo.kommo_lead_id
    ) {
      try {
        const fields = KOMMO_CONTACT_FIELDS_RESPUESTA_IA.map(
          (fieldId, idx) => ({
            fieldId,
            value: segments[idx] ?? "",
          }),
        );
        await setContactTextFields({
          contactId: convInfo.kommo_contact_id,
          fields,
        });
        await launchSalesbot({
          botId: serverEnv().KOMMO_REPLY_BOT_ID,
          leadId: convInfo.kommo_lead_id,
        });
      } catch (err) {
        if (err instanceof KommoApiError) {
          console.error(
            `[jobs/process] Kommo sync fail (contact=${convInfo.kommo_contact_id}, lead=${convInfo.kommo_lead_id}): ${err.status} ${err.body}`,
          );
        } else if (err instanceof KommoConfigError) {
          console.warn("[jobs/process] Kommo no configurado, skip sync");
        } else {
          console.error("[jobs/process] error inesperado en Kommo sync:", err);
        }
      }
    }
  }

  // Job terminado. El estado real del agente vive en el trace.
  await supabase
    .from("agent_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      trace_id: result.traceId,
    })
    .eq("id", job.id);
}

// Polyfill mínimo de findLastIndex para compatibilidad TS strict (Node
// 22 ya lo tiene, pero `tsconfig` puede no incluir la lib ES2023).
function findLastIndex<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== undefined && pred(arr[i] as T)) return i;
  }
  return -1;
}

/**
 * Maneja un fallo de infraestructura al procesar el job (no un fallo del
 * agente, que runAgent absorbe). Reintenta si quedan intentos.
 */
async function handleJobFailure(job: AgentJob, err: unknown): Promise<void> {
  const supabase = getSupabaseServerClient();
  const message = err instanceof Error ? err.message : "error desconocido";
  const exhausted = job.attempts >= job.max_attempts;

  await supabase
    .from("agent_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      error: message,
      completed_at: exhausted ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  console.error(
    `[jobs] job ${job.id} falló (intento ${job.attempts}/${job.max_attempts}): ${message}`,
  );
}
