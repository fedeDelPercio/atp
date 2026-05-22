// ===========================================================================
// Outbox poller: cada 2s lee wa_outbox y envía los pendientes via Baileys.
//
// El panel encola mensajes humanos en wa_outbox cuando el operador escribe
// desde el composer. El bot los toma y los envía. Si falla, incrementa
// attempts y deja sent_at=null para reintento en el próximo tick.
//
// Salvaguardas (incidente del deploy productivo):
//   - Si la sesión Baileys no está abierta (sock.user vacío), skip el batch
//     entero. Sino sendMessage lanza "Cannot read properties of undefined".
//   - Si attempts >= MAX_ATTEMPTS, marcamos sent_at con un error de
//     "abandonado" para que no se reintente más. Evita loops infinitos
//     cuando hay un mensaje envenenado (JID inválido, contenido roto, etc.).
// ===========================================================================

import type { WASocket } from "@whiskeysockets/baileys";
import { getSupabaseClient, getClientSlug } from "./supabase-client";

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 10;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startOutboxPoller(sock: WASocket): void {
  if (timer) return;
  console.log("[bot] outbox poller arrancado (cada 2s)");
  timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    processBatch(sock)
      .catch((err) => console.error("[bot] outbox tick error:", err))
      .finally(() => {
        inFlight = false;
      });
  }, POLL_INTERVAL_MS);
}

export function stopOutboxPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[bot] outbox poller detenido");
  }
}

async function processBatch(sock: WASocket): Promise<void> {
  // Si el socket no está autenticado, no intentamos nada: Baileys lanza un
  // TypeError críptico ("Cannot read properties of undefined (reading 'id')")
  // que confunde más de lo que ayuda y suma attempts en falso.
  if (!sock.user) return;

  const supabase = getSupabaseClient();
  const slug = getClientSlug();
  const { data: pending, error } = await supabase
    .from("wa_outbox")
    .select("id, conversation_id, phone, content, attempts")
    .eq("client_slug", slug)
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[bot] outbox select error:", error.message);
    return;
  }
  if (!pending || pending.length === 0) return;

  for (const item of pending) {
    // El panel ya nos pasa el JID completo cuando la conv tiene wa_jid
    // (acepta @lid o @s.whatsapp.net). Para encolados viejos sin sufijo,
    // asumimos @s.whatsapp.net (número clásico).
    const jid = item.phone.includes("@")
      ? item.phone
      : `${item.phone}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text: item.content });
      await supabase
        .from("wa_outbox")
        .update({ sent_at: new Date().toISOString(), error: null })
        .eq("id", item.id);
      console.log(`[bot] outbox → ${jid}: "${item.content.slice(0, 60)}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "error desconocido";
      const nextAttempts = item.attempts + 1;
      const abandoning = nextAttempts >= MAX_ATTEMPTS;
      console.error(
        `[bot] outbox falló para ${item.phone} (attempt ${nextAttempts}/${MAX_ATTEMPTS})${abandoning ? " — abandonando" : ""}: ${message}`,
      );
      await supabase
        .from("wa_outbox")
        .update({
          attempts: nextAttempts,
          error: abandoning ? `abandoned after ${MAX_ATTEMPTS} attempts: ${message}` : message,
          // Marcar sent_at=now() para sacarlo del query. No es "enviado" de
          // verdad, pero el error queda registrado.
          sent_at: abandoning ? new Date().toISOString() : null,
        })
        .eq("id", item.id);
    }
  }
}
