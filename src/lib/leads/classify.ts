import "server-only";

import type { LeadSmartTag, LeadTemperatura } from "@/lib/supabase/types";

// ===========================================================================
// Clasificacion automatica del lead.
//
// Devuelve un par {smart_tag, temperatura} a partir de:
//  - los mensajes del lead (cuenta + contenido),
//  - la categoria de la ultima notificacion del agente (si existe).
//
// Reglas — orden de prioridad (lo primero que match gana):
//
//  1) Notificacion 'consulta_otro_desarrollo' → interes_otras_opciones / frio.
//     El lead pidio otra zona/desarrollo: no compra ESTE proyecto.
//
//  2) Contenido del lead menciona "a estrenar" / "nuevo" / "0 km" →
//     busca_a_estrenar / frio. Aunque pida contacto, no es para este desarrollo.
//
//  3) Notificacion 'interes_compra' o 'pide_asesor' → interesado / caliente.
//     El lead acepto llamada. Caliente.
//
//  4) Lead tiene 2+ mensajes user → interesado / tibio.
//     Esta conversando, hay interes.
//
//  5) Caso default → curioso / frio.
//     Mando algo (tipicamente el CTA "quiero mas informacion") y nada mas.
//
// La logica es deterministica y trivial de testear. Si en el futuro se
// suma una categoria nueva ('busca_a_estrenar' por tool, por ejemplo),
// se cambia aca.
// ===========================================================================

export interface ClassifyInput {
  leadMessages: { role: string; content: string }[];
  notificationCategory: string | null;
}

export interface ClassifyResult {
  smart_tag: LeadSmartTag;
  temperatura: LeadTemperatura;
}

const A_ESTRENAR_PATTERN =
  /(a\s+estrenar|estreno|estrenarlo|sin\s+habitar|nunca\s+habitado|0\s*km|cero\s*km)/i;

export function classifyLead({
  leadMessages,
  notificationCategory,
}: ClassifyInput): ClassifyResult {
  const userMessages = leadMessages.filter((m) => m.role === "user");
  const userCount = userMessages.length;
  const allUserContent = userMessages.map((m) => m.content).join("\n");

  // (1) Pidio otra alternativa - el smart tag manda sobre todo lo demas.
  if (notificationCategory === "consulta_otro_desarrollo") {
    return { smart_tag: "interes_otras_opciones", temperatura: "frio" };
  }

  // (2) Menciono "a estrenar" o equivalente - tampoco compra este proyecto.
  if (A_ESTRENAR_PATTERN.test(allUserContent)) {
    return { smart_tag: "busca_a_estrenar", temperatura: "frio" };
  }

  // (3) Acepto llamada o pidio asesor → caliente.
  if (
    notificationCategory === "interes_compra" ||
    notificationCategory === "pide_asesor"
  ) {
    return { smart_tag: "interesado", temperatura: "caliente" };
  }

  // (4) 2+ mensajes del lead → tibio.
  if (userCount >= 2) {
    return { smart_tag: "interesado", temperatura: "tibio" };
  }

  // (5) Default: 1 mensaje, sin senales → curioso.
  return { smart_tag: "curioso", temperatura: "frio" };
}
