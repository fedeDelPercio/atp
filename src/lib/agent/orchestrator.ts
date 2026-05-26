import "server-only";

import type {
  MessageParam,
  Tool,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import { serverEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getAnthropicClient } from "./llm-client";
import { loadPrompt } from "./prompts";
import {
  NOTIFY_TEAM_TOOL_NAME,
  NOTIFY_TEAM_TOOL_SCHEMA,
  applyNotifyTeam,
  type NotifyTeamArgs,
} from "./tools";
import { usageToTotals } from "./hooks/token-tracker";
import { timeContextBlock, type TimeContext } from "./business-hours";
import type { HistoryMessage, OrchestratorResult, RunContext } from "./types";

// ===========================================================================
// Orquestador.
//
// Llama UNA vez a `messages.create()` por iteración. La respuesta puede
// contener:
//   - bloques `text` → respuesta para el cliente.
//   - opcionalmente un bloque `tool_use` invocando `notify_team` → señaliza
//     derivación al equipo via RunContext.notification.
//
// El loop externo de reintentos con el evaluator vive en run.ts.
// ===========================================================================

const ORCHESTRATOR_MAX_TOKENS = 2048;

/**
 * System prompt como array de blocks para habilitar prompt caching de Anthropic.
 *
 * El bloque grande (orquestador + KB) es prácticamente constante entre turnos y
 * entre conversaciones del mismo cliente: lo marcamos como `cache_control:
 * ephemeral` para que Anthropic lo guarde 5 minutos. Los re-hits cobran ~10%
 * del costo de input por esos tokens.
 *
 * El segundo bloque (timeContext + actividad + estado del contacto) cambia por
 * turno y se manda sin cache. Es chico (~10 líneas) así que su costo es bajo.
 */
function buildSystemPrompt(
  timeContext: TimeContext,
  customerMessageCount: number,
  isExistingCustomer: boolean,
): TextBlockParam[] {
  const cacheableBlock = [
    loadPrompt("orchestrator"),
    "# BASE DE CONOCIMIENTO",
    loadPrompt("knowledge-base"),
  ].join("\n\n");

  const dynamicBlock = [
    timeContextBlock(timeContext),
    `# Actividad del cliente\n\nEl cliente envió ${customerMessageCount} mensaje(s) en esta ` +
      `conversación (contando el actual). Usalo como guía para el disparador de interés ` +
      `de compra.`,
    customerContextBlock(isExistingCustomer),
  ].join("\n\n");

  return [
    { type: "text", text: cacheableBlock, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicBlock },
  ];
}

/** Bloque con info de si el contacto ya está registrado en el CRM. */
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

/** Mapea el historial de la conversación a mensajes API-compatibles. */
function buildMessages(params: {
  userMessage: string;
  history: HistoryMessage[];
  evaluatorFeedback: string | null;
}): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const m of params.history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      messages.push({ role: "assistant", content: m.content });
    } else if (m.role === "human") {
      // Mensaje de un asesor humano (ya tomó la conversación). Lo serializamos
      // como user para mantener el orden temporal del chat.
      messages.push({
        role: "user",
        content: `[Mensaje del asesor humano del equipo]\n${m.content}`,
      });
    }
    // role === "system": carteles del propio panel (ej: notificaciones). No
    // los pasamos para no confundir al modelo.
  }

  // Mensaje actual del cliente, con el feedback del evaluator si corresponde.
  const lines: string[] = [params.userMessage];
  if (params.evaluatorFeedback) {
    lines.push("");
    lines.push("=== Corrección requerida ===");
    lines.push(
      "Tu respuesta anterior NO pasó la validación interna. Generala de nuevo " +
        "corrigiendo esto:",
    );
    lines.push(params.evaluatorFeedback);
  }
  messages.push({ role: "user", content: lines.join("\n") });

  return messages;
}

/**
 * Inserta un step en agent_trace_steps para una llamada a tool. No falla la
 * corrida si la inserción tira error.
 */
async function logToolStep(
  ctx: RunContext,
  toolName: string,
  input: NotifyTeamArgs,
  output: string,
): Promise<void> {
  try {
    await getSupabaseServerClient()
      .from("agent_trace_steps")
      .insert({
        trace_id: ctx.traceId,
        step_order: ctx.stepOrder++,
        step_type: "tool",
        step_name: toolName,
        iteration: ctx.iteration,
        model: "tool",
        provider: "anthropic",
        input: input as unknown as Json,
        output: { text: output } as Json,
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        error: null,
      });
  } catch (err) {
    console.error("[orchestrator] no se pudo registrar el step de tool:", err);
  }
}

/**
 * Corre una iteración del orquestador. Devuelve la respuesta propuesta y las
 * métricas. Lanza si la API devuelve un error duro (run.ts lo captura).
 */
export async function runOrchestrator(params: {
  ctx: RunContext;
  userMessage: string;
  history: HistoryMessage[];
  evaluatorFeedback: string | null;
  timeContext: TimeContext;
  customerMessageCount: number;
  isExistingCustomer: boolean;
}): Promise<OrchestratorResult> {
  const env = serverEnv();
  const { ctx } = params;
  const model = env.ANTHROPIC_MODEL_ORCHESTRATOR;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), env.AGENT_TIMEOUT_MS);
  const startedAt = Date.now();

  const tools: Tool[] = [NOTIFY_TEAM_TOOL_SCHEMA];

  try {
    const response = await getAnthropicClient().messages.create(
      {
        model,
        max_tokens: ORCHESTRATOR_MAX_TOKENS,
        system: buildSystemPrompt(
          params.timeContext,
          params.customerMessageCount,
          params.isExistingCustomer,
        ),
        messages: buildMessages(params),
        tools,
      },
      { signal: abortController.signal },
    );

    // Procesar los bloques de la respuesta: acumular texto + atender tool_use.
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += (responseText ? "\n" : "") + block.text;
      } else if (
        block.type === "tool_use" &&
        block.name === NOTIFY_TEAM_TOOL_NAME
      ) {
        const args = block.input as NotifyTeamArgs;
        applyNotifyTeam(ctx, args);
        await logToolStep(
          ctx,
          NOTIFY_TEAM_TOOL_NAME,
          args,
          "Equipo notificado. Conversación derivada a un humano.",
        );
      }
    }

    const totals = usageToTotals(response.usage);

    return {
      responseText: responseText.trim(),
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      latencyMs: Date.now() - startedAt,
      model,
      notification: ctx.notification,
    };
  } finally {
    clearTimeout(timeout);
  }
}
