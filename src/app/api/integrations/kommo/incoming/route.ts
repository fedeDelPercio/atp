import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { runAgent } from "@/lib/agent/run";
import {
  KOMMO_PIPELINE_ID,
  KOMMO_CONTACT_FIELD_RESPUESTA_IA,
  statusIdForCategory,
} from "@/lib/kommo/mapping";
import {
  updateLeadStatus,
  setContactTextField,
  launchSalesbot,
  KommoApiError,
  KommoConfigError,
} from "@/lib/kommo/client";
import type { HistoryMessage } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
// El agente puede tardar ~5-15s; reservamos 60s de margen. El webhook
// nativo de Kommo no espera la respuesta para postear nada al lead (eso lo
// hace el bot que lanzamos al final), así que el timeout solo lo limita
// Vercel.
export const maxDuration = 60;

// ===========================================================================
// POST /api/integrations/kommo/incoming
//
// Receptor del webhook NATIVO de Kommo (Centro integraciones → WEB HOOKS),
// suscripto al evento "Mensaje entrante recibido". Kommo manda el payload
// como form-urlencoded con claves anidadas estilo PHP:
//
//   message[add][0][text]=Hola
//   message[add][0][entity_id]=28051622   (lead id)
//   message[add][0][contact_id]=30175914
//   message[add][0][chat_id]=abc-uuid
//   message[add][0][talk_id]=13509
//   message[add][0][type]=incoming
//   account[id]=33057135
//   account[subdomain]=infoibathcomar
//
// Flujo:
//   1. Auth: query param `?secret=...` (Kommo nativo no firma HMAC).
//   2. Parse del body urlencoded + filtrar solo mensajes entrantes.
//   3. Validar account_id matchea KOMMO_ACCOUNT_ID (anti-spoof básico).
//   4. Match/alta de conversation por kommo_lead_id.
//   5. Insertar mensaje del lead, correr `runAgent` síncrono.
//   6. PATCH contact con cf respuesta_ia = respuesta del agente.
//   7. POST /api/v2/salesbot/run con KOMMO_REPLY_BOT_ID → bot envía cf al lead.
//   8. Si hubo escalation, mover lead a etapa correspondiente + nota.
//
// Devuelve 200 a Kommo sin esperar nada (Kommo no procesa el response).
// ===========================================================================

const HISTORY_LIMIT = 10;

export async function POST(req: NextRequest) {
  // 1. Auth básico por query secret (Kommo nativo no firma webhooks).
  const env = serverEnv();
  const expectedSecret = env.KOMMO_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.nextUrl.searchParams.get("secret");
    if (provided !== expectedSecret) {
      console.warn("[kommo/incoming] rechazado: secret inválido o ausente");
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  // 2. Parse del body. Kommo nativo manda form-urlencoded con claves
  //    anidadas estilo PHP (`message[add][0][text]`). Soportamos también
  //    JSON por si alguien usa este endpoint manualmente.
  const rawText = await req.text();
  const contentType = req.headers.get("content-type") ?? "";
  const incoming = contentType.includes("application/json")
    ? parseJsonPayload(rawText)
    : parseKommoFormPayload(rawText);

  if (!incoming) {
    console.warn("[kommo/incoming] no se pudo extraer mensaje del body. Body:", rawText.slice(0, 500));
    // Devolvemos 200 para que Kommo no reintente. Algunos eventos (ej.
    // mensajes outbound, edits, etc.) llegan a este mismo webhook pero no
    // los procesamos.
    return NextResponse.json({ ok: true, skipped: "no_message" });
  }

  // 3. Validar account_id (defensa contra spoof y contra que apuntemos por
  //    accidente a este endpoint desde otra cuenta Kommo).
  if (incoming.accountId && incoming.accountId !== env.KOMMO_ACCOUNT_ID) {
    console.warn(
      `[kommo/incoming] account_id ${incoming.accountId} no matchea ${env.KOMMO_ACCOUNT_ID}`,
    );
    return NextResponse.json({ error: "Cuenta no autorizada" }, { status: 403 });
  }

  // 4. Filtrar: solo procesamos mensajes ENTRANTES (del lead). Los outbound
  //    (que mandamos nosotros o los asesores humanos) también disparan
  //    "Mensaje entrante recibido" en algunas configs.
  if (incoming.type && incoming.type !== "incoming") {
    return NextResponse.json({ ok: true, skipped: `type=${incoming.type}` });
  }

  // 4b. Whitelist por contact_id (modo testing). Cuando ALLOWED_CONTACT_IDS
  //     está seteada, solo respondemos a los contactos listados ahí. Si está
  //     vacía o ausente, respondemos a todos (modo prod). Defensa crítica
  //     mientras validamos: evita que el agente conteste a leads reales del
  //     cliente sin querer.
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

  // 5. Conversation: matchear por kommo_lead_id o crear.
  const conversationId = await findOrCreateConversation({
    leadId: incoming.leadId,
    contactId: incoming.contactId ?? null,
    phone: incoming.authorPhone ?? `kommo_lead_${incoming.leadId}`,
    displayName: incoming.authorName?.trim() || `Lead ${incoming.leadId}`,
  });

  // 6. Insertar mensaje del lead.
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: incoming.text,
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    console.error("[kommo/incoming] no se pudo insertar mensaje:", msgErr);
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
  }

  // 7. Si la conversación está en mode=HUMAN, NO corremos el agente. Un
  //    asesor está atendiendo manualmente; el bot se queda mudo.
  const { data: conv } = await supabase
    .from("conversations")
    .select("mode")
    .eq("id", conversationId)
    .maybeSingle();
  if (conv?.mode === "HUMAN") {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return NextResponse.json({ ok: true, status: "human_mode" });
  }

  // 8. Historial (últimos N excluyendo el mensaje recién insertado).
  const { data: history } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const trimmedHistory: HistoryMessage[] = (history ?? [])
    .filter((m) => m.id !== msg.id)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: m.role as HistoryMessage["role"],
      content: m.content,
    }));

  // 9. Correr el agente sincrónicamente.
  const result = await runAgent({
    conversationId,
    userMessageId: msg.id,
    userMessage: incoming.text,
    history: trimmedHistory,
  });

  // 10. Persistir la respuesta del agente como mensaje(s) del assistant.
  const segments = result.assistantMessage
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let lastMessageId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    const { data: inserted } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: segments[i] ?? "",
        trace_id: isLast ? result.traceId : null,
      })
      .select("id")
      .single();
    if (isLast && inserted) lastMessageId = inserted.id;
  }
  if (lastMessageId) {
    await supabase
      .from("agent_traces")
      .update({ assistant_message_id: lastMessageId })
      .eq("id", result.traceId);
  }

  // 11. Setear cf_respuesta_ia en el CONTACTO + lanzar el bot que envía
  //     ese cf al lead via WA Lite. Si alguno falla, log y seguimos (el
  //     panel queda consistente, solo no llega el mensaje al lead).
  if (incoming.contactId && result.assistantMessage.trim()) {
    try {
      await setContactTextField({
        contactId: incoming.contactId,
        fieldId: KOMMO_CONTACT_FIELD_RESPUESTA_IA,
        value: result.assistantMessage,
      });
      await launchSalesbot({
        botId: env.KOMMO_REPLY_BOT_ID,
        leadId: incoming.leadId,
      });
    } catch (err) {
      if (err instanceof KommoApiError) {
        console.error(
          `[kommo/incoming] error al setear cf o lanzar bot (contact=${incoming.contactId}, lead=${incoming.leadId}): ${err.status} ${err.body}`,
        );
      } else if (err instanceof KommoConfigError) {
        console.warn("[kommo/incoming] Kommo no configurado, skip cf+bot");
      } else {
        console.error("[kommo/incoming] error inesperado:", err);
      }
    }
  }

  // 12. Si hubo escalation, mover lead en Kommo + sumar cartel system.
  if (
    (result.status === "escalated" || result.status === "failed") &&
    result.escalationIsNew !== false
  ) {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "system",
      content: `Derivado al equipo: ${humanize(result.escalationReason ?? "Notificación")}`,
    });
    await syncEscalationToKommo({
      leadId: incoming.leadId,
      category: result.escalationReason ?? null,
      conversationId,
    });
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({
    ok: true,
    status: result.status,
    conversation_id: conversationId,
    trace_id: result.traceId,
  });
}

// ---------------------------------------------------------------------------
// Parsers de payload
// ---------------------------------------------------------------------------

interface IncomingMessage {
  leadId: number;
  contactId: number | null;
  text: string;
  type: string | null;
  accountId: number | null;
  authorPhone: string | null;
  authorName: string | null;
}

/**
 * Parsea el body urlencoded de un webhook nativo de Kommo y extrae el
 * primer mensaje entrante encontrado bajo `message[add][N][*]`. Si no hay
 * mensajes en `add`, devuelve null (puede ser un evento de otro tipo).
 */
function parseKommoFormPayload(rawText: string): IncomingMessage | null {
  const params = new URLSearchParams(rawText);
  // Reagrupar claves anidadas tipo `message[add][0][text]` en un objeto
  // navegable. Solo armamos el primer mensaje (index 0); webhooks de Kommo
  // típicamente mandan un mensaje por hit, pero permitimos múltiples bajo
  // el mismo array sin procesarlos para no duplicar agente.
  const msgPrefix = "message[add][0]";
  const get = (suffix: string): string | null =>
    params.get(`${msgPrefix}[${suffix}]`);

  const leadIdStr = get("entity_id");
  const text = get("text");
  if (!leadIdStr || !text) return null;
  const leadId = Number(leadIdStr);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  const contactIdStr = get("contact_id") ?? get("author[id]");
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
      get("author[phone]") ?? get("phone") ?? params.get("contact[phone]"),
    authorName: get("author[name]") ?? get("author[full_name]"),
  };
}

/** Variante JSON: para invocación manual o testing con curl. */
function parseJsonPayload(rawText: string): IncomingMessage | null {
  try {
    const body = JSON.parse(rawText) as Record<string, unknown>;
    const leadId = Number(body.lead_id ?? body.entity_id);
    const text = String(body.message ?? body.text ?? "");
    if (!Number.isFinite(leadId) || leadId <= 0 || !text) return null;
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
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers de DB y CRM
// ---------------------------------------------------------------------------

async function findOrCreateConversation(args: {
  leadId: number;
  contactId: number | null;
  phone: string;
  displayName: string;
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
      mode: "AI",
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

async function syncEscalationToKommo(args: {
  leadId: number;
  category: string | null;
  conversationId: string;
}): Promise<void> {
  try {
    const statusId = statusIdForCategory(args.category);
    const noteText = buildKommoNote({
      category: args.category,
      conversationId: args.conversationId,
    });
    await updateLeadStatus({
      leadId: args.leadId,
      pipelineId: KOMMO_PIPELINE_ID,
      statusId,
      noteText,
    });
  } catch (err) {
    if (err instanceof KommoConfigError) {
      console.warn(`[kommo/incoming] Kommo no configurado; skip sync para lead ${args.leadId}`);
      return;
    }
    if (err instanceof KommoApiError) {
      console.error(
        `[kommo/incoming] Kommo respondió ${err.status} al mover lead ${args.leadId}:`,
        err.body,
      );
      return;
    }
    console.error("[kommo/incoming] error inesperado al sync con Kommo:", err);
  }
}

function buildKommoNote(args: {
  category: string | null;
  conversationId: string;
}): string {
  const cat = args.category ? humanize(args.category) : "Notificación";
  const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://atp-ibath.vercel.app";
  return [
    `Lead derivado automaticamente por el agente IA.`,
    `Categoria: ${cat}`,
    `Ver conversacion: ${panelUrl}/conversations/${args.conversationId}`,
  ].join("\n");
}

function humanize(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
