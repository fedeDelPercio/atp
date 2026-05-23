import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/wa/messages/[conversationId]
//
// Body: { content: string }
// Encola un mensaje humano (escrito por un asesor desde el composer del
// panel) para que el bot lo envíe via Baileys al WhatsApp del lead.
//
// Flujo:
//   1. Insertar en `messages` con role='human' (visible en la conversación
//      al instante).
//   2. Insertar en `wa_outbox` con phone + content. El bot polea cada 2s.
// ===========================================================================

const bodySchema = z.object({
  content: z.string().min(1).max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { content } = parsed.data;
  const supabase = getSupabaseServerClient();

  // Resolver la conversación para confirmar que es WhatsApp y obtener phone.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, source, external_id, wa_jid")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json({ error: "Conversacion inexistente" }, { status: 404 });
  }
  if (conv.source !== "whatsapp") {
    return NextResponse.json(
      { error: "Esta conversación no es de WhatsApp" },
      { status: 400 },
    );
  }
  if (!conv.external_id) {
    return NextResponse.json(
      { error: "Conversacion sin phone (external_id)" },
      { status: 400 },
    );
  }

  // 1. Insertar mensaje human.
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "human", content })
    .select("id")
    .single();
  if (msgErr || !msg) {
    return NextResponse.json(
      { error: msgErr?.message ?? "no se pudo guardar mensaje" },
      { status: 500 },
    );
  }

  // 2. Encolar para el bot.
  // `phone` en outbox se usa como JID directo si tiene "@" — soporta @lid
  // y @s.whatsapp.net. Para convs viejas sin wa_jid, fallback a digits.
  const outboxPhone = conv.wa_jid ?? conv.external_id;
  const { error: outboxErr } = await supabase.from("wa_outbox").insert({
    conversation_id: conversationId,
    phone: outboxPhone,
    content,
  });
  if (outboxErr) {
    // El mensaje ya quedó en la conversación, pero no se va a enviar al lead.
    return NextResponse.json(
      { error: outboxErr.message, messageId: msg.id, queued: false },
      { status: 500 },
    );
  }

  // Bump del updated_at.
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, messageId: msg.id, queued: true });
}
