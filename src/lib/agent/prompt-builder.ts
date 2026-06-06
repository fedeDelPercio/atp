import type {
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import { timeContextBlock, type TimeContext } from "./business-hours";
import type { HistoryMessage } from "./types";

// ===========================================================================
// Armado del system prompt + messages del orquestador.
//
// Vive en su propio modulo (NO "server-only") para que el harness de evals lo
// pueda importar y armar el prompt exactamente como en produccion: misma
// estructura, mismo prompt caching, mismas reglas de mapeo del historial.
// orchestrator.ts (server-only) carga los .md con loadPrompt y se lo pasa
// como string a buildSystemPrompt; el harness los lee con readFileSync.
//
// Cambios en estructura del prompt -> tocar SOLO acá. Producción y evals
// quedan alineados sin esfuerzo.
// ===========================================================================

/**
 * Bloque con info de si el contacto ya está registrado en el CRM.
 * Si es existing customer el prompt fuerza notify_team("cliente_existente").
 */
function customerContextBlock(isExisting: boolean): string {
  if (isExisting) {
    return [
      "=== Estado del contacto ===",
      "ATENCIÓN: el contacto YA ESTÁ REGISTRADO en nuestro CRM (Kommo).",
      "Es un cliente existente, no un lead nuevo.",
      "Disparador obligatorio: llamá a `notify_team` con",
      "`category: \"cliente_existente\"` de inmediato, sin iniciar el flow",
      "comercial de descubrimiento. En `summary` aclará que es un cliente",
      "ya registrado que volvió a contactarse.",
    ].join("\n");
  }
  return [
    "=== Estado del contacto ===",
    "El contacto NO está registrado en nuestro CRM. Tratalo como un lead",
    "nuevo y seguí el flow comercial normal del orquestador.",
  ].join("\n");
}

/**
 * Arma el system prompt como array de blocks para habilitar prompt caching
 * de Anthropic. El bloque grande (orchestrator + KB) se marca como cacheable;
 * el bloque dinamico (timeContext + actividad + estado del contacto) va sin
 * cache porque cambia por turno.
 */
export function buildSystemPrompt(args: {
  orchestratorPrompt: string;
  knowledgeBase: string;
  timeContext: TimeContext;
  customerMessageCount: number;
  isExistingCustomer: boolean;
}): TextBlockParam[] {
  const cacheableBlock = [
    args.orchestratorPrompt,
    "# BASE DE CONOCIMIENTO",
    args.knowledgeBase,
  ].join("\n\n");

  const dynamicBlock = [
    timeContextBlock(args.timeContext),
    `# Actividad del cliente\n\nEl cliente envió ${args.customerMessageCount} mensaje(s) en esta ` +
      `conversación (contando el actual). Usalo como guía para el disparador de interés ` +
      `de compra.`,
    customerContextBlock(args.isExistingCustomer),
  ].join("\n\n");

  return [
    { type: "text", text: cacheableBlock, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicBlock },
  ];
}

/**
 * Mapea el historial de la conversación a mensajes API-compatibles.
 * Los mensajes "human" (asesor humano) se serializan como user para
 * mantener el orden. Los "system" del panel se omiten.
 */
export function buildMessages(args: {
  userMessage: string;
  history: HistoryMessage[];
  evaluatorFeedback: string | null;
}): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const m of args.history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      messages.push({ role: "assistant", content: m.content });
    } else if (m.role === "human") {
      messages.push({
        role: "user",
        content: `[Mensaje del asesor humano del equipo]\n${m.content}`,
      });
    }
    // role === "system": carteles del propio panel. No los pasamos.
  }

  const lines: string[] = [args.userMessage];
  if (args.evaluatorFeedback) {
    lines.push("");
    lines.push("=== Corrección requerida ===");
    lines.push(
      "Tu respuesta anterior NO pasó la validación interna. Generala de nuevo " +
        "corrigiendo esto:",
    );
    lines.push(args.evaluatorFeedback);
  }
  messages.push({ role: "user", content: lines.join("\n") });

  return messages;
}
