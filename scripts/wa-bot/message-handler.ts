// ===========================================================================
// Handler de mensajes entrantes de WhatsApp.
//
// Flujo (con acumulador de mensajes / debounce 20s):
//   1. Filtros (no grupos, no fromMe, no broadcasts).
//   2. Resolver/crear conversación con source='whatsapp' y phone=external_id.
//   3. Insertar mensaje user.
//   4. Programar (o extender) un timer de 20s por conversación.
//      - Si en esa ventana llega otro mensaje del mismo usuario, el timer
//        se reinicia: el agente espera a que el usuario "termine" de
//        escribir.
//      - Cuando el timer expira sin nuevos mensajes, processBurst() corre:
//        recolecta todos los user messages del burst, los concatena y le
//        pasa al agente como un solo turno.
//   5. processBurst() chequea mode (puede haber cambiado mientras corría
//      el debounce), arma history, llama runAgent y envía la respuesta
//      por Baileys.
//
// El timer vive en memoria del proceso del bot (no en DB): si el proceso
// se reinicia durante un debounce activo, esos mensajes quedan en la DB
// pero NO van a tener respuesta automática. Es el trade-off de mantener
// la lógica local; si llega a ser un problema, se migra a `agent_jobs`
// con process_at como en el webhook del panel.
// ===========================================================================

import { downloadMediaMessage, type WASocket, type proto } from "@whiskeysockets/baileys";

import { runAgent } from "../../src/lib/agent/run";
import type { HistoryMessage } from "../../src/lib/agent/types";
import { transcribeAudio, TranscriptionError } from "../../src/lib/transcription";
import { getSupabaseClient, getClientSlug } from "./supabase-client";
import { getWaState } from "./connection-state";

const HISTORY_LIMIT = 20;
const DEBOUNCE_MS = 20_000;

// Timers activos de debounce por conversation_id. Cada vez que llega un
// mensaje, si ya hay timer se cancela y se reprograma; cuando el timer
// vence sin interrupciones, se procesa el burst.
const pendingTimers = new Map<string, NodeJS.Timeout>();

interface BurstContext {
  sock: WASocket;
  conversationId: string;
  remoteJid: string;
  phone: string;
}

export async function handleIncomingMessages(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
): Promise<void> {
  // === Filtros (con log para diagnóstico) ===
  console.log(`[bot] msg.key=${JSON.stringify(msg.key)} pushName=${msg.pushName ?? "?"}`);
  const jid = msg.key?.remoteJid ?? "(sin jid)";
  if (!msg.key?.remoteJid) {
    console.log(`[bot] descarto: sin remoteJid`);
    return;
  }
  if (msg.key.fromMe) {
    console.log(`[bot] descarto fromMe → ${jid}`);
    return;
  }
  const remoteJid = msg.key.remoteJid;
  if (remoteJid.endsWith("@g.us")) {
    console.log(`[bot] descarto grupo ${jid}`);
    return;
  }
  if (remoteJid === "status@broadcast") {
    console.log(`[bot] descarto status broadcast`);
    return;
  }
  // @s.whatsapp.net = número clásico. @lid = "Linked ID", identificador
  // opaco de privacidad que WhatsApp usa cuando no expone el phone real
  // (típico cuando el remitente no está en contactos del receptor).
  if (
    !remoteJid.endsWith("@s.whatsapp.net") &&
    !remoteJid.endsWith("@lid")
  ) {
    console.log(`[bot] descarto no 1:1 ${jid}`);
    return;
  }

  let text = extractText(msg);
  let transcribedFromAudio = false;

  // Si no hay texto, intentar transcripción de audio (PTT o audioMessage).
  if (!text) {
    const audio = msg.message?.audioMessage;
    if (audio) {
      try {
        console.log(`[bot] audio recibido de ${jid}, transcribiendo...`);
        const buffer = (await downloadMediaMessage(
          msg,
          "buffer",
          {},
        )) as Buffer;
        const mimetype = audio.mimetype ?? "audio/ogg";
        text = await transcribeAudio(buffer, {
          language: "es",
          filename: "voice.ogg",
          mimeType: mimetype,
        });
        transcribedFromAudio = true;
        console.log(`[bot] audio transcripto (${text.length} chars): "${text.slice(0, 80)}"`);
      } catch (err) {
        const msg =
          err instanceof TranscriptionError ? err.message : String(err);
        console.error(`[bot] no se pudo transcribir audio de ${jid}: ${msg}`);
        return;
      }
    }
  }

  if (!text) {
    const kinds = Object.keys(msg.message ?? {}).join(",");
    console.log(`[bot] ignoro msg sin texto (${jid}) kinds=[${kinds}]`);
    return;
  }

  // Prefijo visual para distinguir audios en el panel.
  if (transcribedFromAudio) {
    text = `🎙️ ${text}`;
  }

  const phone = remoteJid.split("@")[0] ?? "";
  if (!phone) return;
  const pushName = msg.pushName ?? null;
  const isLid = remoteJid.endsWith("@lid");

  console.log(`[bot] ← ${phone} (${pushName ?? "?"}): "${text.slice(0, 80)}"`);

  // === 2. Resolver conversación ===
  const supabase = getSupabaseClient();
  const slug = getClientSlug();
  const waState = await getWaState();
  const defaultMode = waState?.default_mode === "AI" ? "AI" : "HUMAN";
  const conversationId = await getOrCreateConversation(
    phone,
    pushName,
    slug,
    isLid,
    remoteJid,
    defaultMode,
  );
  if (!conversationId) {
    console.error(`[bot] no se pudo resolver conversación para ${phone}`);
    return;
  }

  // === 3. Insertar mensaje user ===
  const { error: userMsgErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: text });
  if (userMsgErr) {
    console.error(`[bot] no se pudo insertar mensaje user:`, userMsgErr);
    return;
  }
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  // === 4. Programar / extender debounce ===
  // Si ya hay un timer activo para esta conv, lo cancelamos y reprogramamos.
  // Asi varios mensajes del usuario en menos de 20s "extienden" la ventana
  // y el agente solo corre cuando termina de escribir.
  const existing = pendingTimers.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    console.log(`[bot] debounce extendido para conv ${conversationId}`);
  } else {
    console.log(`[bot] debounce iniciado (${DEBOUNCE_MS / 1000}s) para conv ${conversationId}`);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(conversationId);
    void processBurst({ sock, conversationId, remoteJid, phone }).catch((err) => {
      console.error(`[bot] processBurst falló para conv ${conversationId}:`, err);
    });
  }, DEBOUNCE_MS);
  pendingTimers.set(conversationId, timer);
}

/**
 * Procesa el burst acumulado de mensajes user de una conversación.
 *
 * Se llama cuando el debounce vence sin nuevos mensajes. Recolecta todos
 * los user messages desde el último mensaje no-user, los concatena y le
 * pasa al agente como un solo turno.
 */
async function processBurst(ctx: BurstContext): Promise<void> {
  const supabase = getSupabaseClient();
  const { sock, conversationId, remoteJid, phone } = ctx;

  // Re-leer modo: pudo haber cambiado durante la ventana del debounce
  // (operador tomó la conversación desde el panel, por ejemplo).
  const { data: convoFresh } = await supabase
    .from("conversations")
    .select("mode")
    .eq("id", conversationId)
    .maybeSingle();
  const mode = (convoFresh?.mode ?? "AI") as "AI" | "HUMAN";
  if (mode === "HUMAN") {
    console.log(`[bot] conv ${conversationId} pasó a HUMAN durante el debounce, no respondo`);
    return;
  }

  // Mensajes completos de la conversación, ordenados.
  const { data: allMessages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const messages = allMessages ?? [];

  // Burst: todos los user messages al final de la conversación sin que haya
  // un mensaje del agente/humano/sistema en el medio. Buscamos desde el
  // final hacia atrás.
  const burst: typeof messages = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user") {
      burst.unshift(m);
      continue;
    }
    break;
  }
  if (burst.length === 0) {
    console.log(`[bot] no hay user messages pendientes para conv ${conversationId}`);
    return;
  }

  const userMessage = burst.map((m) => m.content).join("\n\n");
  const anchorMessageId = burst[0]!.id;
  const burstIds = new Set(burst.map((m) => m.id));

  console.log(
    `[bot] processBurst conv=${conversationId} mensajes=${burst.length} chars=${userMessage.length}`,
  );

  // History: ultimos N mensajes anteriores al burst.
  const history: HistoryMessage[] = messages
    .filter((m) => !burstIds.has(m.id))
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role as HistoryMessage["role"], content: m.content }));

  // === Llamar agente ===
  console.log(`[bot] llamando agente con ${history.length} msgs de historial...`);
  const startedAt = Date.now();
  const result = await runAgent({
    conversationId,
    userMessageId: anchorMessageId,
    userMessage,
    history,
  });
  console.log(`[bot] agente respondió en ${Date.now() - startedAt}ms (status=${result.status})`);

  // Si el agente derivó sin respuesta al lead, no hay nada que enviar.
  if (!result.assistantMessage || result.assistantMessage.trim() === "") {
    console.log("[bot] agente derivó sin texto al lead, nada que enviar");
    if (result.status === "escalated") {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "system",
        content: `🔔 NOTIFICACIÓN AL EQUIPO — ${humanizeCategory(result.escalationReason ?? "Notificación")}. La conversación fue derivada a un humano.`,
      });
    }
    return;
  }

  // === Split por --- y persistir + enviar ===
  const segments = result.assistantMessage
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let lastInsertedId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    const segment = segments[i]!;
    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: segment,
        trace_id: isLast ? result.traceId : null,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error(`[bot] no se pudo insertar segment ${i}:`, insErr);
      continue;
    }
    if (isLast) lastInsertedId = inserted.id;

    try {
      await sock.sendMessage(remoteJid, { text: segment });
      await supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", inserted.id);
      console.log(`[bot] → ${phone}: "${segment.slice(0, 60)}"`);
    } catch (err) {
      console.error(`[bot] error enviando segment ${i} por Baileys:`, err);
    }
  }

  if (lastInsertedId) {
    await supabase
      .from("agent_traces")
      .update({ assistant_message_id: lastInsertedId })
      .eq("id", result.traceId);
  }

  if (result.status === "escalated") {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "system",
      content: `🔔 NOTIFICACIÓN AL EQUIPO — ${humanizeCategory(result.escalationReason ?? "Notificación")}. La conversación fue derivada a un humano.`,
    });
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

function extractText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  // imageMessage.caption, etc. queda fuera del scope v1.
  return null;
}

async function getOrCreateConversation(
  phone: string,
  pushName: string | null,
  slug: string,
  isLid: boolean,
  remoteJid: string,
  defaultMode: "AI" | "HUMAN",
): Promise<string | null> {
  const supabase = getSupabaseClient();
  // Buscar por (client_slug, source, external_id).
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, wa_jid")
    .eq("client_slug", slug)
    .eq("source", "whatsapp")
    .eq("external_id", phone)
    .maybeSingle();
  if (existing) {
    // Backfill defensivo: si la conv es vieja y no tiene wa_jid, lo seteamos
    // ahora que sabemos el JID completo del remitente.
    if (!existing.wa_jid) {
      await supabase
        .from("conversations")
        .update({ wa_jid: remoteJid })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  // Si es LID no mostramos el ID como si fuera un teléfono.
  const displayName = pushName?.trim() || (isLid ? "Contacto" : `+${phone}`);
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      display_name: displayName,
      source: "whatsapp",
      external_id: phone,
      wa_jid: remoteJid,
      mode: defaultMode,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error(`[bot] no se pudo crear conv para ${phone}:`, error);
    return null;
  }
  console.log(`[bot] conv creada ${created.id} para +${phone} (${displayName})`);
  return created.id;
}

// Mismas etiquetas que el worker del panel.
const CATEGORY_LABEL: Record<string, string> = {
  interes_compra: "Interés de compra",
  visita_obra: "Visita a obra",
  consulta_financiacion: "Consulta de financiación",
  cliente_existente: "Cliente existente",
  fuera_de_conocimiento: "Consulta fuera de la base de conocimiento",
  escalado_manual: "Escalado manual",
};

function humanizeCategory(category: string): string {
  return (
    CATEGORY_LABEL[category] ??
    category
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
