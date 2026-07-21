import "server-only";

import type { Tool, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "./llm-client";
import { currentProvider, modelForEvaluator } from "./models";
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
  const model = modelForEvaluator();
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
    // Safety net 2 (CRITICA): si el suggestion concluye positivamente
    // ("aprobala", "es valida", "todos los criterios se cumplen") pero devuelve
    // pass:false, el modelo se esta contradiciendo a si mismo. Forzamos
    // pass:true. Visto en prod (2026-06-08, Etel + Margarita): el evaluator
    // razonaba "Reconsiderando: la respuesta pasa todos los criterios. Aprobá
    // la respuesta." y devolvia pass:false con failedCriteria espurios. Eso
    // dejaba al lead sin respuesta tras 3 iteraciones.
    const finalPass =
      parsed.pass ||
      normalizedSuggestion === null ||
      suggestionConcludesApprove(normalizedSuggestion) ||
      isLegitimateFranjaAcuse({
        userMessage: params.userMessage,
        assistantResponse: params.assistantResponse,
        failedCriteria: parsed.failedCriteria,
      });
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
        provider: currentProvider(),
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
 * patrones observados en producción (2026-06-07 y 2026-06-08).
 */
/**
 * Heurística defensiva específica del flow interes_compra / pide_asesor.
 *
 * Cuando:
 *   - el ÚLTIMO mensaje del lead es una franja horaria ("tarde" / "mañana"
 *     / "después del mediodía" / "ok mañana", etc),
 *   - y la respuesta del orchestrator es el ACUSE esperado por el prompt
 *     ("te llaman por la <franja>", "te contactan por la <franja>", etc),
 *     opcionalmente seguido del pedido del email,
 *   - y el evaluator rechazó por estilo_imperativo,
 * entonces forzamos pass:true. El acuse afirmativo de la franja NO es
 * imperativo: es el ACK del flujo (el lead ya dio el sí, no tiene sentido
 * convertirlo a "si te parece"). Sin esta defensa el evaluator bloquea
 * los 3 reintentos y deriva como fuera_de_conocimiento.
 *
 * Observado en producción (2026-06-17): trace ad94b453, conv "validacion-
 * followup-bot". Mica respondió "Genial, te llaman por la tarde. Para
 * dejarlo registrado, me pasás tu mail?" → evaluador rechazó 3 veces →
 * derivación incorrecta.
 */
function isLegitimateFranjaAcuse(args: {
  userMessage: string;
  assistantResponse: string;
  failedCriteria: string[];
}): boolean {
  if (!args.failedCriteria.includes("estilo_imperativo")) return false;
  const u = args.userMessage.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const a = args.assistantResponse.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const userConfirmedFranja =
    /\b(maniana|manana|tarde|mediodi[ao]|siesta)\b/.test(u) ||
    /a\s+partir\s+de\s+(las|las\s+\d)/.test(u) ||
    /despu[eé]s\s+de\s+(las|el\s+mediodia)/.test(u);
  if (!userConfirmedFranja) return false;
  const acuseShape =
    /te\s+(llaman|llama|contactan|contacta|llamamos|contactamos)/.test(a) ||
    /(un\s+asesor|el\s+asesor)\s+(se\s+comunica|te\s+llama|se\s+contacta)/.test(a) ||
    /te\s+van\s+a\s+(llamar|contactar)/.test(a);
  return acuseShape;
}

function suggestionConcludesApprove(suggestion: string): boolean {
  const s = suggestion.toLowerCase();
  return (
    /aprobá la respuesta/.test(s) ||
    /aprob[áa]r la respuesta/.test(s) ||
    /corrigiendo el veredicto a pass:?\s*true/.test(s) ||
    /la respuesta es v[áa]lida/.test(s) ||
    /la respuesta pasa todos los criterios/.test(s) ||
    /todos los criterios.*(se cumplen|son v[áa]lidos|cumplen)/.test(s) ||
    /no hay alucinaci[óo]n/.test(s) ||
    /todas las afirmaciones son v[áa]lidas/.test(s) ||
    /veredicto final: la respuesta es v[áa]lida/.test(s) ||
    /reconsiderando.*(aprob|v[áa]lida|pasa todos)/.test(s)
  );
}
