import { after, NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import {
  getContactTags,
  getLeadTags,
  KommoApiError,
  KommoConfigError,
} from "@/lib/kommo/client";
import { transcribeAudio, TranscriptionError } from "@/lib/transcription";

export const dynamic = "force-dynamic";
// El receiver es liviano (parse + encolar + transcribir si hay audio).
// El maxDuration alto es para que el after() pueda esperar el debounce
// (DEBOUNCE_MS + 500ms) antes de disparar el worker. Con plan Vercel
// Pro podemos llegar hasta 800s; reservamos 65s para que un debounce
// de hasta 60s entre dentro del limite con margen.
export const maxDuration = 65;

// ===========================================================================
// POST /api/integrations/kommo/incoming
//
// Receptor del webhook NATIVO de Kommo, suscripto a "Mensaje entrante
// recibido". Hace solo lo liviano:
//
//   1. Auth (secret en query string).
//   2. Parse del body urlencoded estilo Kommo (`message[add][0][*]`).
//   3. Whitelist por account_id + contact_id.
//   4. Idempotencia: si ya procesamos este kommo_message_id, skip.
//   5. Check etiqueta `humano_atiende` del contacto → si la tiene, NO
//      respondemos (asesor humano atiende).
//   6. Si es audio, transcribir con Whisper antes de seguir.
//   7. Insertar mensaje en la DB.
//   8. Encolar/actualizar agent_job con process_at = now + DEBOUNCE_MS
//      (debounce: si llega otro mensaje en ese plazo reseteamos el timer
//      y procesamos todo junto).
//   9. Auto-trigger del worker via after() + setTimeout para que despache
//      cuando el timer expira (Vercel Hobby no nos da cron de minutos).
//   10. Devolver 200 a Kommo.
//
// El runAgent + setContactTextField + launchSalesbot quedan en el WORKER
// (/api/jobs/process), que procesa el batch acumulado.
// ===========================================================================

export async function POST(req: NextRequest) {
  const env = serverEnv();

  // 1. Auth.
  if (env.KOMMO_WEBHOOK_SECRET) {
    if (req.nextUrl.searchParams.get("secret") !== env.KOMMO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  // 2. Parse body.
  const rawText = await req.text();
  const contentType = req.headers.get("content-type") ?? "";
  const incoming = contentType.includes("application/json")
    ? parseJsonPayload(rawText)
    : parseKommoFormPayload(rawText);

  if (!incoming) {
    return NextResponse.json({ ok: true, skipped: "no_message" });
  }

  // 3. Validar account + whitelist + type=incoming.
  if (incoming.accountId && incoming.accountId !== env.KOMMO_ACCOUNT_ID) {
    return NextResponse.json({ error: "Cuenta no autorizada" }, { status: 403 });
  }
  if (incoming.type && incoming.type !== "incoming") {
    return NextResponse.json({ ok: true, skipped: `type=${incoming.type}` });
  }
  const allowedRaw = env.KOMMO_ALLOWED_CONTACT_IDS;
  if (allowedRaw && allowedRaw.trim()) {
    const allowed = new Set(
      allowedRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    if (!incoming.contactId || !allowed.has(incoming.contactId)) {
      console.log(
        `[kommo/incoming] contact_id ${incoming.contactId} NO whitelisted, skip`,
      );
      return NextResponse.json({
        ok: true,
        skipped: "contact_not_whitelisted",
      });
    }
  }

  const supabase = getSupabaseServerClient();

  // 4. Idempotencia: skip si ya procesamos este kommo_message_id.
  if (incoming.messageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("kommo_message_id", incoming.messageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }
  }

  // 5. Tag humana: si el contacto o el lead tienen la etiqueta, no
  //    procesamos. El asesor humano atiende. Volver a IA = sacar la
  //    etiqueta. Chequeamos ambos lugares porque la UI de Kommo invita a
  //    aplicar la tag en el lead (visible en kanban) más que en el contacto.
  try {
    const humanTag = env.KOMMO_HUMAN_TAG_NAME.toLowerCase();
    const [contactTags, leadTags] = await Promise.all([
      incoming.contactId
        ? getContactTags(incoming.contactId).catch(() => [])
        : Promise.resolve([]),
      getLeadTags(incoming.leadId).catch(() => []),
    ]);
    const hasHumanTag = [...contactTags, ...leadTags].some(
      (t) => t.name?.toLowerCase() === humanTag,
    );
    if (hasHumanTag) {
      // Insertamos el mensaje del lead igual (para que el equipo vea el
      // historial en el panel), pero NO encolamos job.
      await insertUserMessage(supabase, {
        conversationId: await findOrCreateConversation({
          leadId: incoming.leadId,
          contactId: incoming.contactId,
          phone: incoming.authorPhone ?? `kommo_lead_${incoming.leadId}`,
          displayName: incoming.authorName?.trim() || `Lead ${incoming.leadId}`,
          mode: "HUMAN",
        }),
        content: incoming.text,
        kommoMessageId: incoming.messageId,
      });
      return NextResponse.json({ ok: true, status: "human_mode" });
    }
  } catch (err) {
    // Si Kommo tira error consultando tags, NO bloqueamos el flow:
    // log warning y procesamos como si no tuviera tag (mejor responder
    // que dejar al lead sin respuesta).
    console.warn("[kommo/incoming] error consultando tags:", err);
  }

  // 6. Si es audio, transcribir antes de insertar (Whisper ~3-5s).
  let finalText = incoming.text;
  if (incoming.audioUrl) {
    try {
      finalText = await transcribeAudioFromUrl(incoming.audioUrl);
      console.log(
        `[kommo/incoming] audio transcripto (${finalText.length} chars)`,
      );
    } catch (err) {
      console.error("[kommo/incoming] error transcribiendo audio:", err);
      // Fallback: si la transcripción falla, marcamos como audio sin texto.
      finalText = "[Audio recibido — no se pudo transcribir]";
    }
  }

  // 7. Conversation + mensaje del lead.
  const conversationId = await findOrCreateConversation({
    leadId: incoming.leadId,
    contactId: incoming.contactId ?? null,
    phone: incoming.authorPhone ?? `kommo_lead_${incoming.leadId}`,
    displayName: incoming.authorName?.trim() || `Lead ${incoming.leadId}`,
  });

  // Antes de insertar: si la conversation YA está en mode=HUMAN (porque
  // un asesor la tomó desde el panel ATP, no por etiqueta de Kommo),
  // tampoco procesamos. Mantenemos el mensaje en el historial pero no
  // encolamos job.
  const { data: conv } = await supabase
    .from("conversations")
    .select("mode")
    .eq("id", conversationId)
    .maybeSingle();
  if (conv?.mode === "HUMAN") {
    await insertUserMessage(supabase, {
      conversationId,
      content: finalText,
      kommoMessageId: incoming.messageId,
    });
    return NextResponse.json({ ok: true, status: "human_mode_panel" });
  }

  const msg = await insertUserMessage(supabase, {
    conversationId,
    content: finalText,
    kommoMessageId: incoming.messageId,
  });
  if (!msg) {
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
  }

  // 8. Encolar/actualizar agent_job con debounce. Si ya hay un job pending
  //    para esta conversation, reseteamos process_at (timer del debounce).
  //    Si no hay, creamos uno nuevo.
  const debounceMs = env.DEBOUNCE_MS;
  const processAt = new Date(Date.now() + debounceMs).toISOString();

  const { data: existingJob } = await supabase
    .from("agent_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJob) {
    await supabase
      .from("agent_jobs")
      .update({
        process_at: processAt,
        process_after: processAt,
        user_message_id: msg.id,
      })
      .eq("id", existingJob.id);
  } else {
    await supabase.from("agent_jobs").insert({
      conversation_id: conversationId,
      user_message_id: msg.id,
      status: "pending",
      process_at: processAt,
      process_after: processAt,
      client_slug: "ibath",
    });
  }

  // 9. Auto-trigger del worker: esperamos el debounce y disparamos un fetch
  //    a /api/jobs/process. `after()` mantiene viva la función serverless
  //    aunque ya devolvimos 200 al webhook. Si llega otro mensaje en el
  //    debounce que resetea el timer, este fetch igual va a disparar al
  //    final, el worker va a ver que el job tiene process_at > now y no
  //    procesará (claim_agent_jobs solo agarra los listos). Costo extra
  //    aceptable.
  after(
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, debounceMs + 500));
      await fetch(`${req.nextUrl.origin}/api/jobs/process`, {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET },
      }).catch((err) => {
        console.error("[kommo/incoming] error disparando worker:", err);
      });
    })(),
  );

  return NextResponse.json({
    ok: true,
    status: "queued",
    conversation_id: conversationId,
    process_at: processAt,
  });
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

interface IncomingMessage {
  leadId: number;
  contactId: number | null;
  text: string;
  type: string | null;
  accountId: number | null;
  authorPhone: string | null;
  authorName: string | null;
  messageId: string | null;
  /** URL del audio si el mensaje es de voz. null si es texto. */
  audioUrl: string | null;
}

function parseKommoFormPayload(rawText: string): IncomingMessage | null {
  const params = new URLSearchParams(rawText);
  const msgPrefix = "message[add][0]";
  // Helper para keys anidadas estilo PHP: pasar segmentos sin brackets.
  // get("attachment", "link") → params.get("message[add][0][attachment][link]")
  const get = (...keys: string[]): string | null => {
    const fullKey = msgPrefix + keys.map((k) => `[${k}]`).join("");
    return params.get(fullKey);
  };

  const leadIdStr = get("entity_id");
  const text = get("text") ?? "";

  // Tipo de mensaje según Kommo: "text", "voice", "picture", "file", etc.
  // Para audios (voice) bajamos el attachment[link] y lo mandamos a Whisper.
  // Para otros media no soportados (picture/file) devolvemos null y el
  // endpoint hace skip — el lead manda media, el equipo lo atiende manual.
  const messageType = (get("message_type") ?? get("attachment", "type") ?? "")
    .toLowerCase();
  const isVoice = messageType === "voice" || messageType === "audio";
  const audioUrl = isVoice ? get("attachment", "link") : null;

  // Sin entity_id no podemos identificar el lead. Si hay audio pero no
  // texto, esperamos audio y dejamos que se transcriba después.
  if (!leadIdStr) return null;
  if (!text && !audioUrl) return null;

  const leadId = Number(leadIdStr);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  const contactIdStr = get("contact_id") ?? get("author", "id");
  const contactId = contactIdStr ? Number(contactIdStr) : null;

  const accountIdStr = params.get("account[id]");
  const accountId = accountIdStr ? Number(accountIdStr) : null;

  return {
    leadId,
    contactId: contactId && Number.isFinite(contactId) ? contactId : null,
    text,
    type: get("type"),
    accountId: accountId && Number.isFinite(accountId) ? accountId : null,
    authorPhone:
      get("author", "phone") ?? get("phone") ?? params.get("contact[phone]"),
    authorName: get("author", "name") ?? get("author", "full_name"),
    messageId: get("id"),
    audioUrl,
  };
}

function parseJsonPayload(rawText: string): IncomingMessage | null {
  try {
    const body = JSON.parse(rawText) as Record<string, unknown>;
    const leadId = Number(body.lead_id ?? body.entity_id);
    const text = String(body.message ?? body.text ?? "");
    const audioUrl =
      typeof body.audio_url === "string"
        ? body.audio_url
        : typeof body.attachment_url === "string"
          ? body.attachment_url
          : null;
    if (!Number.isFinite(leadId) || leadId <= 0) return null;
    if (!text && !audioUrl) return null;
    const contactIdRaw = body.contact_id;
    const contactId =
      contactIdRaw != null && Number.isFinite(Number(contactIdRaw))
        ? Number(contactIdRaw)
        : null;
    return {
      leadId,
      contactId,
      text,
      type: (body.type as string | undefined) ?? null,
      accountId: null,
      authorPhone: (body.phone as string | undefined) ?? null,
      authorName: (body.contact_name as string | undefined) ?? null,
      messageId: (body.message_id as string | undefined) ?? null,
      audioUrl,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

async function transcribeAudioFromUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new TranscriptionError(
      `Descarga de audio falló: HTTP ${res.status} en ${url.slice(0, 100)}`,
    );
  }
  const blob = await res.blob();
  // Intentamos deducir el filename de la URL; si falla, default ogg
  // (formato típico de WhatsApp).
  const urlPath = new URL(url).pathname;
  const guessExt = urlPath.match(/\.(\w{3,4})(?:$|\?)/)?.[1] ?? "ogg";
  return transcribeAudio(blob, {
    language: "es",
    filename: `voice.${guessExt}`,
    mimeType: blob.type || `audio/${guessExt}`,
  });
}

// ---------------------------------------------------------------------------
// Helpers de DB
// ---------------------------------------------------------------------------

async function insertUserMessage(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  args: {
    conversationId: string;
    content: string;
    kommoMessageId: string | null;
  },
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: "user",
      content: args.content,
      kommo_message_id: args.kommoMessageId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // race condition con otro disparo del mismo mensaje.
      return null;
    }
    console.error("[kommo/incoming] insertUserMessage error:", error);
    return null;
  }
  return data;
}

async function findOrCreateConversation(args: {
  leadId: number;
  contactId: number | null;
  phone: string;
  displayName: string;
  mode?: "AI" | "HUMAN";
}): Promise<string> {
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("kommo_lead_id", args.leadId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      display_name: args.displayName,
      source: "whatsapp",
      external_id: args.phone,
      kommo_lead_id: args.leadId,
      kommo_contact_id: args.contactId,
      mode: args.mode ?? "AI",
      client_slug: "ibath",
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `No se pudo crear la conversation para lead ${args.leadId}: ${error?.message ?? "desconocido"}`,
    );
  }
  return created.id;
}

// Re-export para que el sistema sepa que estos tipos se usan (silencia
// warnings de lint en algunas configs estrictas).
export type { IncomingMessage };
// suppress unused imports
void KommoApiError;
void KommoConfigError;
