import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";
import { runOrchestrator } from "./orchestrator";
import { evaluateResponse } from "./evaluator";
import { getTimeContext } from "./business-hours";
import type {
  AgentRunInput,
  AgentRunResult,
  NotificationCategory,
  OrchestratorResult,
  RunContext,
  TraceStatus,
} from "./types";
import type { Json } from "@/lib/supabase/types";

// ===========================================================================
// runAgent — entry point del sistema agéntico.
//
// Orquesta el loop EXTERNO: corre el orquestador, lo valida con el evaluator
// y reintenta con feedback hasta MAX_ITERATIONS. Si el orquestador notifica
// al equipo (tool notify_team) o si no se logra una respuesta validada, se
// registra una notificación y la conversación queda en manos de un humano.
//
// No inserta nada en `messages`: de eso se encarga el worker de jobs.
// ===========================================================================

// Cuando la conversación se deriva al equipo NO se le manda ningún mensaje
// al lead — la notificación interna al equipo es la señal y el humano va a
// tomar el control. Antes mandábamos un mensaje de despedida, pero pollute
// la experiencia del cliente final.
const NO_REPLY_TO_LEAD = "";

const FAILURE_NOTICE =
  "Disculpá, tuvimos un inconveniente para procesar tu mensaje. Reintentá en " +
  "un momento, por favor.";

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const supabase = getSupabaseServerClient();
  const maxIterations = serverEnv().AGENT_MAX_ITERATIONS;

  // 1. Crear el trace en estado 'running'.
  const { data: trace, error: traceErr } = await supabase
    .from("agent_traces")
    .insert({
      conversation_id: input.conversationId,
      user_message_id: input.userMessageId,
      status: "running",
      provider: "anthropic",
    })
    .select("id")
    .single();

  if (traceErr || !trace) {
    throw new Error(`No se pudo crear el trace: ${traceErr?.message ?? "desconocido"}`);
  }
  const traceId = trace.id;

  const ctx: RunContext = {
    traceId,
    conversationId: input.conversationId,
    iteration: 0,
    stepOrder: 0,
    notification: { notified: false, category: null, reason: null, summary: null },
  };

  // Leer contexto adicional de la conversación: si es de prueba puede tener
  // un timestamp simulado (para probar fuera de horario sin esperar) y/o un
  // flag de "cliente ya registrado". En producción (source=whatsapp), el flag
  // is_existing_customer lo trae la integración con Kommo (pendiente).
  const { data: conv } = await supabase
    .from("conversations")
    .select("source, simulated_timestamp, is_existing_customer")
    .eq("id", input.conversationId)
    .maybeSingle();

  const simulatedNow =
    conv?.source === "test" && conv.simulated_timestamp
      ? new Date(conv.simulated_timestamp)
      : new Date();
  const isExistingCustomer = conv?.is_existing_customer ?? false;

  // Contexto compartido por todas las iteraciones.
  const timeContext = getTimeContext(simulatedNow);
  const customerMessageCount =
    input.history.filter((m) => m.role === "user").length + 1;

  let totalInput = 0;
  let totalOutput = 0;
  let totalLatency = 0;
  let evaluatorFeedback: string | null = null;
  let iterationsRun = 0;

  // 2. Loop de reintentos con el evaluator.
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    ctx.iteration = iteration;
    iterationsRun = iteration;

    let orch: OrchestratorResult;
    try {
      orch = await runOrchestrator({
        ctx,
        userMessage: input.userMessage,
        history: input.history,
        evaluatorFeedback,
        timeContext,
        customerMessageCount,
        isExistingCustomer,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "error desconocido";
      await finalizeTrace(traceId, {
        status: "failed",
        iterations: iterationsRun,
        totalInput,
        totalOutput,
        totalLatency,
        evaluatorPassed: null,
        escalationReason: reason,
      });
      await dispatchEvent("agent.failed", {
        conversationId: input.conversationId,
        traceId,
        error: reason,
      });
      return { traceId, assistantMessage: FAILURE_NOTICE, status: "failed", escalationReason: reason };
    }

    totalInput += orch.inputTokens;
    totalOutput += orch.outputTokens;
    totalLatency += orch.latencyMs;
    await logOrchestratorStep(ctx, orch);

    // El orquestador notificó al equipo: handoff, la conversación se congela.
    if (orch.notification.notified) {
      const category = orch.notification.category ?? "fuera_de_conocimiento";
      await recordNotification({
        traceId,
        conversationId: input.conversationId,
        category,
        reason: orch.notification.reason,
        summary: orch.notification.summary,
      });
      await finalizeTrace(traceId, {
        status: "escalated",
        iterations: iterationsRun,
        totalInput,
        totalOutput,
        totalLatency,
        evaluatorPassed: null,
        escalationReason: category,
      });
      await dispatchEvent("agent.escalated", {
        conversationId: input.conversationId,
        traceId,
        category,
        reason: orch.notification.reason,
        summary: orch.notification.summary,
      });
      // Derivación: no le mandamos nada al lead. La notificación interna
      // ya fue registrada; el humano tomará la conversación.
      return {
        traceId,
        assistantMessage: NO_REPLY_TO_LEAD,
        status: "escalated",
        escalationReason: category,
      };
    }

    // Validar con el evaluator (portón de pre-envío / anti-alucinación).
    const evaluation = await evaluateResponse({
      ctx,
      userMessage: input.userMessage,
      assistantResponse: orch.responseText,
      history: input.history,
    });

    if (evaluation.pass) {
      await finalizeTrace(traceId, {
        status: "completed",
        iterations: iterationsRun,
        totalInput,
        totalOutput,
        totalLatency,
        evaluatorPassed: true,
        escalationReason: null,
      });
      await dispatchEvent("agent.responded", {
        conversationId: input.conversationId,
        traceId,
        message: orch.responseText,
      });
      return { traceId, assistantMessage: orch.responseText, status: "completed" };
    }

    // No pasó la validación: guardar feedback y reintentar.
    evaluatorFeedback = evaluation.suggestion;
  }

  // 3. Se agotaron las iteraciones sin una respuesta validada: la IA no pudo
  //    responder de forma confiable -> notificar al equipo y CORTAR (no
  //    seguir gastando tokens ni mandar nada al lead). El summary incluye
  //    el ultimo feedback del evaluator para que el admin entienda que
  //    seguia fallando.
  const category: NotificationCategory = "fuera_de_conocimiento";
  const reason = `Agente bloqueado: el evaluator rechazo ${iterationsRun} veces seguidas.`;
  const summary = [
    `Consulta del cliente: "${input.userMessage}"`,
    "",
    `El agente intento responder ${iterationsRun} veces y el evaluator rechazo cada intento.`,
    evaluatorFeedback
      ? `Ultimo feedback del evaluator: ${evaluatorFeedback}`
      : "Sin feedback registrado.",
    "",
    "Requiere respuesta directa de un asesor humano.",
  ].join("\n");
  await recordNotification({
    traceId,
    conversationId: input.conversationId,
    category,
    reason,
    summary,
  });
  await finalizeTrace(traceId, {
    status: "escalated",
    iterations: iterationsRun,
    totalInput,
    totalOutput,
    totalLatency,
    evaluatorPassed: false,
    escalationReason: category,
  });
  await dispatchEvent("agent.escalated", {
    conversationId: input.conversationId,
    traceId,
    category,
    reason: "max_iterations_sin_respuesta_validada",
  });
  return {
    traceId,
    assistantMessage: NO_REPLY_TO_LEAD,
    status: "escalated",
    escalationReason: category,
  };
}

// --- helpers ---------------------------------------------------------------

/** Registra una notificación al equipo de ventas. */
async function recordNotification(args: {
  traceId: string;
  conversationId: string;
  category: NotificationCategory;
  reason: string | null;
  summary: string | null;
}): Promise<void> {
  try {
    await getSupabaseServerClient().from("agent_notifications").insert({
      conversation_id: args.conversationId,
      trace_id: args.traceId,
      category: args.category,
      reason: args.reason,
      summary: args.summary,
    });
  } catch (err) {
    console.error("[run] no se pudo registrar la notificación:", err);
  }
}

/** Registra el step del orquestador (con sus tokens) en el trace. */
async function logOrchestratorStep(
  ctx: RunContext,
  orch: OrchestratorResult,
): Promise<void> {
  try {
    await getSupabaseServerClient()
      .from("agent_trace_steps")
      .insert({
        trace_id: ctx.traceId,
        step_order: ctx.stepOrder++,
        step_type: "orchestrator",
        step_name: "orchestrator",
        iteration: ctx.iteration,
        model: orch.model,
        provider: "anthropic",
        input: null,
        output: {
          responseText: orch.responseText,
          notified: orch.notification.notified,
        } as Json,
        input_tokens: orch.inputTokens,
        output_tokens: orch.outputTokens,
        latency_ms: orch.latencyMs,
        error: null,
      });
  } catch (err) {
    console.error("[run] no se pudo registrar el step del orquestador:", err);
  }
}

/** Cierra el trace con su estado final y las métricas acumuladas. */
async function finalizeTrace(
  traceId: string,
  data: {
    status: TraceStatus;
    iterations: number;
    totalInput: number;
    totalOutput: number;
    totalLatency: number;
    evaluatorPassed: boolean | null;
    escalationReason: string | null;
  },
): Promise<void> {
  await getSupabaseServerClient()
    .from("agent_traces")
    .update({
      status: data.status,
      iterations: data.iterations,
      total_input_tokens: data.totalInput,
      total_output_tokens: data.totalOutput,
      total_latency_ms: data.totalLatency,
      evaluator_passed: data.evaluatorPassed,
      escalation_reason: data.escalationReason,
    })
    .eq("id", traceId);
}
