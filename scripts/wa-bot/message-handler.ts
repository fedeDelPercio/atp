// ===========================================================================
// Handler de mensajes entrantes de WhatsApp.
//
// Flujo:
//   1. Filtros (no grupos, no fromMe, no audio/imagen, no broadcasts).
//   2. Resolver/crear conversación con source='whatsapp' y phone=external_id.
//   3. Insertar mensaje user.
//   4. Re-leer la conversación: chequear mode (puede haber cambiado mientras
//      llegaba el mensaje).
//   5. Si mode === 'HUMAN': nada más, el humano responderá desde el panel.
//   6. Si mode === 'AI': llamar runAgent() (mismo agente que el panel),
//      partir el assistantMessage por '---', insertar cada bloque como
//      mensaje assistant, enviar cada uno por Baileys y marcar delivered_at.
// ===========================================================================

import { downloadMediaMessage, type WASocket, type proto } from "@whiskeysockets/baileys";

import { runAgent } from "../../src/lib/agent/run";
import type { HistoryMessage } from "../../src/lib/agent/types";
import { transcribeAudio, TranscriptionError } from "../../src/lib/transcription";
import { getSupabaseClient, getClientSlug } from "./supabase-client";
import { getWaState } from "./connection-state";

const HISTORY_LIMIT = 20;

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
  // Modo por defecto a aplicar si la conv no existe (account-level toggle).
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
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: text })
    .select("id")
    .single();
  if (userMsgErr || !userMsg) {
    console.error(`[bot] no se pudo insertar mensaje user:`, userMsgErr);
    return;
  }
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  // === 4. Re-leer modo (race-free) ===
  const { data: convoFresh } = await supabase
    .from("conversations")
    .select("mode")
    .eq("id", conversationId)
    .maybeSingle();
  const mode = (convoFresh?.mode ?? "AI") as "AI" | "HUMAN";

  if (mode === "HUMAN") {
    console.log(`[bot] conv ${conversationId} está en HUMAN, no respondo`);
    return;
  }

  // === 5. Historial para el agente ===
  const { data: previousMessages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const history: HistoryMessage[] = (previousMessages ?? [])
    .filter((m) => m.id !== userMsg.id)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role as HistoryMessage["role"], content: m.content }));

  // === 6. Llamar agente ===
  console.log(`[bot] llamando agente con ${history.length} msgs de historial...`);
  const startedAt = Date.now();
  const result = await runAgent({
    conversationId,
    userMessageId: userMsg.id,
    userMessage: text,
    history,
  });
  console.log(`[bot] agente respondió en ${Date.now() - startedAt}ms (status=${result.status})`);

  // Si el agente derivó sin respuesta al lead, no hay nada que enviar.
  if (!result.assistantMessage || result.assistantMessage.trim() === "") {
    console.log("[bot] agente derivó sin texto al lead, nada que enviar");
    // Pero sí persistir el cartel de notificación al equipo (igual que worker).
    if (result.status === "escalated") {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "system",
        content: `🔔 NOTIFICACIÓN AL EQUIPO — ${humanizeCategory(result.escalationReason ?? "Notificación")}. La conversación fue derivada a un humano.`,
      });
    }
    return;
  }

  // === 7. Split por --- y persistir + enviar ===
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

    // Enviar por Baileys.
    try {
      await sock.sendMessage(remoteJid, { text: segment });
      await supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", inserted.id);
      console.log(`[bot] → ${phone}: "${segment.slice(0, 60)}"`);
    } catch (err) {
      console.error(`[bot] error enviando segment ${i} por Baileys:`, err);
      // Dejamos delivered_at = null, podríamos sumar logica de reintento
      // futura. Por ahora el mensaje queda en DB y no se entregó.
    }
  }

  if (lastInsertedId) {
    await supabase
      .from("agent_traces")
      .update({ assistant_message_id: lastInsertedId })
      .eq("id", result.traceId);
  }

  // Cartel de sistema si escaló a pesar de tener texto.
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
