import "server-only";

import type { Tool, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "./llm-client";
import { loadPrompt } from "./prompts";
import { usageToTotals } from "./hooks/token-tracker";
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
// El evaluator usa `tool_choice` forzado sobre una tool ficticia
// `evaluation_result`. Eso garantiza output estructurado sin parseo manual.
// ===========================================================================

const EVALUATOR_MAX_TOKENS = 512;

const evaluationSchema = z.object({
  pass: z.boolean(),
  failedCriteria: z.array(z.string()).default([]),
  suggestion: z.string().nullable().default(null),
});

const EVALUATION_TOOL_NAME = "evaluation_result";

const EVALUATION_TOOL_SCHEMA: Tool = {
  name: EVALUATION_TOOL_NAME,
  description:
    "Reporta el resultado de la validación de la respuesta del asesor. " +
    "Llamala SIEMPRE, esta es la única forma de devolver el veredicto.",
  input_schema: {
    type: "object",
    properties: {
      pass: {
        type: "boolean",
        description:
          "true si la respuesta es válida (puede enviarse al cliente). " +
          "false si rompe alguna regla (grounding, persona, etc.).",
      },
      failedCriteria: {
        type: "array",
        items: { type: "string" },
        description:
          "IDs de los criterios que falló (snake_case). Vacío si pass=true.",
      },
      suggestion: {
        type: "string",
        description:
          "Si pass=false, qué tiene que corregir el orquestador en el " +
          "próximo intento. Si pass=true, podés dejar string vacío.",
      },
    },
    required: ["pass", "failedCriteria", "suggestion"],
  },
};

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

  // El user message va como array de blocks para habilitar prompt caching del
  // KB, que es lo mas grande (~500 lineas) y constante entre validaciones.
  const variablePart = [
    "Validá la siguiente respuesta del asesor ANTES de que llegue al cliente.",
    "",
    "=== Mensaje del cliente ===",
    params.userMessage,
    "",
    "=== Respuesta propuesta por el asesor ===",
    params.assistantResponse || "(respuesta vacía)",
    "",
  ].join("\n");
  const kbPart =
    "=== BASE DE CONOCIMIENTO (única fuente válida para afirmaciones de producto) ===\n" +
    loadPrompt("knowledge-base");
  const closingPart = "\nDevolvé tu veredicto invocando la tool `evaluation_result`.";

  const userContent: TextBlockParam[] = [
    { type: "text", text: variablePart },
    { type: "text", text: kbPart, cache_control: { type: "ephemeral" } },
    { type: "text", text: closingPart },
  ];

  let evaluation: EvaluationResult;
  let usage: unknown = null;

  try {
    const response = await getAnthropicClient().messages.create(
      {
        model,
        max_tokens: EVALUATOR_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: loadPrompt("evaluator"),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
        tools: [EVALUATION_TOOL_SCHEMA],
        tool_choice: { type: "tool", name: EVALUATION_TOOL_NAME },
      },
      { signal: abortController.signal },
    );
    usage = response.usage;

    // Con tool_choice forzado siempre debería venir un bloque tool_use.
    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> =>
        b.type === "tool_use" && b.name === EVALUATION_TOOL_NAME,
    );
    if (!toolBlock) {
      throw new Error("el evaluator no invocó la tool evaluation_result");
    }

    const parsed = evaluationSchema.parse(toolBlock.input);
    const normalizedSuggestion =
      parsed.suggestion === null || parsed.suggestion.trim() === ""
        ? null
        : parsed.suggestion;
    // Safety net 1: si el evaluator rechaza pero no puede justificar
    // (suggestion vacio), aprobamos. Sin feedback concreto, el orquestador no
    // puede corregir y reintentar lo mismo agota tokens sin valor. Es la
    // traduccion del "en la duda, aprobar" del prompt del evaluator: solo se
    // rechaza con explicacion accionable.
    //
    // Safety net 2 (CRITICA): si el suggestion concluye positivamente pero
    // devuelve pass:false, el modelo se esta contradiciendo a si mismo.
    // Forzamos pass:true. Sumado tras ver el bug en Quintaglia (Etel +
    // Margarita 2026-06-08): el evaluator decia "aproba la respuesta" en
    // el suggestion y devolvia pass:false. Aplicado tambien aca por
    // defense-in-depth.
    const finalPass =
      parsed.pass ||
      normalizedSuggestion === null ||
      suggestionConcludesApprove(normalizedSuggestion);
    evaluation = {
      pass: finalPass,
      failedCriteria: finalPass ? [] : parsed.failedCriteria,
      suggestion: finalPass ? null : normalizedSuggestion,
    };
    if (finalPass && !parsed.pass) {
      console.warn(
        `[evaluator] auto-overrode pass=false → pass=true por suggestion ` +
          `contradictorio (trace ${ctx.traceId}, iter ${ctx.iteration}). ` +
          `Criterios reportados: ${parsed.failedCriteria.join(",")}. ` +
          `Suggestion: ${normalizedSuggestion?.slice(0, 200)}`,
      );
    }
  } catch (err) {
    // Output malformado, abort, o cualquier error: se trata como rechazo.
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

/**
 * Heurística defensiva: cuando el LLM evaluator se contradice diciendo
 * "aprobá" / "es válida" en el `suggestion` pero igual devolvió `pass:false`,
 * tratamos esa contradicción como una aprobación. Defense-in-depth para que
 * el lead no quede sin respuesta cuando el modelo razona caóticamente.
 *
 * Match conservador: requiere una frase conclusiva clara, no solo "está
 * bien" suelto en una oración intermedia. Las frases listadas vienen de
 * patrones observados en producción de Quintaglia (2026-06-07 y 2026-06-08).
 */
function suggestionConcludesApprove(suggestion: string): boolean {
  const s = suggestion.toLowerCase();
  // Capa 1: conclusión positiva explícita (el modelo se contradice
  // diciendo "aprobá" pero devuelve pass:false).
  const concludesApprove =
    /aprobá la respuesta/.test(s) ||
    /aprob[áa]r la respuesta/.test(s) ||
    /corrigiendo el veredicto a pass:?\s*true/.test(s) ||
    /la respuesta es v[áa]lida/.test(s) ||
    /la respuesta pasa todos los criterios/.test(s) ||
    /todos los criterios.*(se cumplen|son v[áa]lidos|cumplen)/.test(s) ||
    /todas las afirmaciones son v[áa]lidas/.test(s) ||
    /veredicto final: la respuesta es v[áa]lida/.test(s) ||
    /reconsiderando.*(aprob|v[áa]lida|pasa todos)/.test(s);
  if (concludesApprove) return true;

  // Capa 2: el evaluator admite que los datos son correctos pero igual
  // rechaza por presentación / estructura / flujo. Eso NO es grounding,
  // es coaching del flow del orchestrator. Patrón visto en prod
  // (preuba 2026-06-08): "la URL es correcta según la KB, pero la
  // estructura no respeta el flujo comercial".
  const admitsDataCorrect =
    /no hay alucinaci[óo]n/.test(s) ||
    /no es (una )?alucinaci[óo]n/.test(s) ||
    /la url.*(es correcta|coincide|es v[áa]lida|es la oficial)/.test(s) ||
    /(el|los) dato(s)? (es|son) (correcto|correctos|v[áa]lido|v[áa]lidos)/.test(s) ||
    /datos.*coincide(n)? con la kb/.test(s) ||
    /no rompe la kb/.test(s) ||
    /la informaci[óo]n es correcta/.test(s) ||
    /las afirmaciones (de producto )?(son v[áa]lidas|son correctas)/.test(s);

  const isStructureComplaint =
    /(la )?estructura.*no respeta/.test(s) ||
    /(no respeta|fuera de)?\s*(el )?flujo comercial/.test(s) ||
    /(la )?presentaci[óo]n.*(genera confusi[óo]n|invierte|no es la indicada)/.test(s) ||
    /(es )?prematur[oa]/.test(s) ||
    /sin contextualizar/.test(s) ||
    /(la )?estrategia.*no est[áa] respaldada/.test(s) ||
    /(la )?redacci[óo]n.*(podr[íi]a|deber[íi]a)/.test(s);

  // Si admite que los datos están bien pero su queja es estructural,
  // tratamos como pass:true. El estilo y flow los maneja el orchestrator.
  return admitsDataCorrect && isStructureComplaint;
}
