import "server-only";

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadPrompt } from "./prompts";
import { usageToTotals } from "./hooks/token-tracker";
import { resolveClaudeCodeExecutable } from "./binary";
import type { EvaluationResult, HistoryMessage, RunContext } from "./types";
import type { Json } from "@/lib/supabase/types";

// ===========================================================================
// Evaluator — portón de pre-envío.
//
// Corre DESPUÉS de que el orquestador redacta pero ANTES de que el mensaje
// llegue al cliente. Su trabajo principal y bloqueante es el GROUNDING: cada
// afirmación de la respuesta debe estar respaldada por la base de
// conocimiento. Una respuesta no aprobada NO se envía: el orquestador la
// regenera con el feedback. Si tras los reintentos no se logra una respuesta
// aprobada, run.ts notifica al equipo (categoría fuera_de_conocimiento).
//
// El evaluator recibe la base de conocimiento para poder verificar grounding.
// Es una sesión separada del SDK, sin tools, con el modelo barato (Haiku).
// ===========================================================================

const evaluationSchema = z.object({
  pass: z.boolean(),
  failedCriteria: z.array(z.string()).default([]),
  suggestion: z.string().nullable().default(null),
});

/** Extrae el primer objeto JSON de un texto (tolera markdown o texto extra). */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("la respuesta del evaluator no contiene JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Valida una respuesta del orquestador. Nunca lanza: ante cualquier problema
 * devuelve un rechazo con failedCriteria=['malformed_output'].
 */
export async function evaluateResponse(params: {
  ctx: RunContext;
  userMessage: string;
  assistantResponse: string;
  history: HistoryMessage[];
}): Promise<EvaluationResult> {
  const env = serverEnv();
  const { ctx } = params;
  const model = env.ANTHROPIC_MODEL_EVALUATOR;
  const startedAt = Date.now();

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), env.AGENT_TIMEOUT_MS);

  const promptData = [
    "Validá la siguiente respuesta del asesor ANTES de que llegue al cliente.",
    "",
    "=== Mensaje del cliente ===",
    params.userMessage,
    "",
    "=== Respuesta propuesta por el asesor ===",
    params.assistantResponse || "(respuesta vacía)",
    "",
    "=== BASE DE CONOCIMIENTO (única fuente válida para afirmaciones de producto) ===",
    loadPrompt("knowledge-base"),
    "",
    'Respondé ÚNICAMENTE con el JSON: {"pass": boolean, "failedCriteria": string[], "suggestion": string|null}',
  ].join("\n");

  const options: Options = {
    systemPrompt: loadPrompt("evaluator"),
    model,
    maxTurns: 2,
    tools: [],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: [],
    abortController,
    includePartialMessages: false,
    pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
  };

  let rawText = "";
  let usage: unknown = null;
  let evaluation: EvaluationResult;

  try {
    for await (const message of query({ prompt: promptData, options })) {
      if (message.type === "result" && message.subtype === "success") {
        rawText = message.result;
        usage = message.usage;
      }
    }
    const parsed = evaluationSchema.parse(extractJson(rawText));
    evaluation = {
      pass: parsed.pass,
      failedCriteria: parsed.failedCriteria,
      suggestion: parsed.suggestion,
    };
  } catch (err) {
    // Output malformado o error de la sesión: se trata como rechazo.
    evaluation = {
      pass: false,
      failedCriteria: ["malformed_output"],
      suggestion:
        "No se pudo validar la respuesta. Volvé a generarla apoyándote " +
        "estrictamente en la base de conocimiento.",
    };
    console.error("[evaluator] no se pudo evaluar:", err);
  } finally {
    clearTimeout(timeout);
  }

  // Registrar el step del evaluator en el trace.
  const totals = usageToTotals(usage);
  try {
    await getSupabaseServerClient()
      .from("agent_trace_steps")
      .insert({
        trace_id: ctx.traceId,
        step_order: ctx.stepOrder++,
        step_type: "evaluator",
        step_name: "evaluator",
        iteration: ctx.iteration,
        model,
        provider: "anthropic",
        input: {
          userMessage: params.userMessage,
          assistantResponse: params.assistantResponse,
        } as Json,
        output: evaluation as unknown as Json,
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        latency_ms: Date.now() - startedAt,
        error: null,
      });
  } catch (err) {
    console.error("[evaluator] no se pudo registrar el step:", err);
  }

  return evaluation;
}
