import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { classifyLead } from "./classify";

// ===========================================================================
// ensureLeadForConversation
//
// Idempotente: si ya existe un lead para la conversacion no hace nada.
// Si no existe, lo crea con la informacion disponible (nombre de la conv,
// telefono, etc.) y le asigna smart_tag + temperatura computados a partir
// del estado actual de la conversacion.
//
// Se llama:
//  - Apenas se crea una conversacion (nuevo contacto WA, conv de test) →
//    arranca como lead 'nuevo' / 'curioso' / 'frio'.
//  - Tras cada job procesado por el agente → re-evalua smart_tag y
//    temperatura por si cambiaron (mas mensajes, notificacion, etc.).
//    Esta llamada NO sobrescribe si smart_tag_manual=true.
//
// No lanza: un fallo aca no debe romper el flow del agente.
// ===========================================================================

export async function ensureLeadForConversation(
  conversationId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();

    const { data: existing } = await supabase
      .from("leads")
      .select("id, smart_tag_manual")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    const [{ data: conv }, { data: msgs }, { data: notification }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("display_name, wa_jid, external_id, source")
          .eq("id", conversationId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        supabase
          .from("agent_notifications")
          .select("category")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (!conv) return;

    const classification = classifyLead({
      leadMessages: msgs ?? [],
      notificationCategory: notification?.category ?? null,
    });

    if (existing) {
      // No tocar si el operador edito manualmente.
      if (existing.smart_tag_manual) return;
      await supabase
        .from("leads")
        .update({
          smart_tag: classification.smart_tag,
          temperatura: classification.temperatura,
        })
        .eq("id", existing.id);
      return;
    }

    // Crear lead nuevo.
    // OJO: si el JID termina en `@lid`, el numero antes del `@` NO es un
    // telefono real — es un Linked ID opaco que WhatsApp usa para privacidad
    // cuando el remitente no esta en contactos del receptor. Guardar eso
    // como "phone" muestra IDs sin sentido tipo 20250787627030 en la UI.
    // En ese caso dejamos phone en null y la UI muestra "—".
    const isLidJid = conv.wa_jid?.endsWith("@lid") ?? false;
    const phone = isLidJid
      ? null
      : (conv.wa_jid?.split("@")[0] ?? conv.external_id ?? null);
    const name = conv.display_name ?? null;

    await supabase.from("leads").insert({
      conversation_id: conversationId,
      interest_category: notification?.category ?? "sin_categoria",
      phone,
      name,
      smart_tag: classification.smart_tag,
      temperatura: classification.temperatura,
    });
  } catch (err) {
    console.error("[leads] ensureLeadForConversation falló:", err);
  }
}
