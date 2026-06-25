import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";
import { sendEscalationEmail } from "@/lib/email";
import { getContact, getContactPhone } from "@/lib/kommo/client";
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
// y reintenta con feedback hasta MAX_ITERATIONS (default 3 = 1 generación +
// 2 reintentos). El evaluator es flaco — solo chequea grounding crítico y
// no_revela_ia; el estilo se normaliza en código (ver sanitize.ts) antes
// de llegar acá.
//
// Si tras 3 iter el evaluator sigue rechazando, distinguimos:
//   - Crítico (grounding sobre dato concreto de KB o no_revela_ia) →
//     derivar a humano como fuera_de_conocimiento.
//   - No crítico (queja vaga sobre presentación/estructura/flujo) →
//     enviar la última respuesta del orchestrator al cliente igual +
//     console.warn. Sin notificación al equipo, sin lead. Premisa: el
//     evaluator se equivoca a menudo; un cliente sin respuesta es peor.
//
// Si el orquestador notifica al equipo directamente (tool notify_team) la
// conversación se congela y queda en manos de un humano.
//
// No inserta nada en `messages`: de eso se encarga el worker de jobs.
// ===========================================================================

// Cierre de fallback. Nunca dejamos al cliente sin respuesta cuando la
// conversación se deriva: si el orquestador derivó sin generar texto (no
// debería pasar con el prompt actual, que exige cierre siempre) o si se
// agotaron las iteraciones del evaluator, igual le confirmamos que Santino
// lo va a contactar, con el timing ya resuelto (por la tarde / mañana / el
// lunes). Tono positivo de cierre, no de "no pude resolver".
function handoffFallbackNotice(followUpTiming: string): string {
  return (
    "Buenísimo. Nuestro asesor Santino Zamboni se va a estar contactando " +
    `con vos ${followUpTiming} para asesorarte con más detalle`
  );
}

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

  // Si la conversación ya fue derivada en un turno anterior, se lo avisamos
  // al orquestador: las notificaciones son internas (no están en el
  // historial), así que sin esto el modelo no sabe que ya derivó y vuelve a
  // hacerlo en cada turno (repitiendo "Santino te va a llamar" ante un
  // simple "gracias"). Tomamos la notificación más reciente como contexto.
  const { data: priorNotif } = await supabase
    .from("agent_notifications")
    .select("category")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorEscalation = priorNotif?.category ?? null;

  let totalInput = 0;
  let totalOutput = 0;
  let totalLatency = 0;
  let evaluatorFeedback: string | null = null;
  let iterationsRun = 0;
  // Estado del último intento, para poder enviar la respuesta final al
  // cliente cuando el evaluator rechaza por motivos no críticos tras
  // agotarse las iteraciones (ver sección 3 abajo).
  let lastResponseText: string | null = null;
  let lastEvaluation: {
    failedCriteria: string[];
    suggestion: string | null;
  } | null = null;

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
        priorEscalation,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "error desconocido";
      // Falla dura del orquestador (ej. error de API / límite de uso). NUNCA
      // le mandamos un mensaje de disculpa al cliente: notificamos al equipo
      // para que un humano tome la conversación y NO respondemos nada. El
      // cliente no se entera de la falla técnica; el equipo sí.
      const escalationIsNew = await recordNotification({
        traceId,
        conversationId: input.conversationId,
        category: "falla_tecnica",
        reason,
        summary:
          `El agente no pudo procesar el mensaje del cliente ("${input.userMessage}") ` +
          `por un error técnico: ${reason}. Requiere respuesta manual de un asesor.`,
      });
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
      if (escalationIsNew) {
        await sendEscalationEmailForConv({
          conversationId: input.conversationId,
          category: "falla_tecnica",
          reason,
          summary:
            `El agente no pudo procesar el mensaje del cliente ("${input.userMessage}") ` +
            `por un error tecnico: ${reason}. Requiere respuesta manual de un asesor.`,
        });
      }
      // assistantMessage vacío: el worker no inserta ninguna burbuja para el
      // cliente. escalationReason = la categoría (no el error crudo) para que
      // el cartel del panel diga "Falla técnica" y no filtre el detalle.
      return {
        traceId,
        assistantMessage: "",
        status: "failed",
        escalationReason: "falla_tecnica",
        escalationIsNew,
      };
    }

    totalInput += orch.inputTokens;
    totalOutput += orch.outputTokens;
    totalLatency += orch.latencyMs;
    await logOrchestratorStep(ctx, orch);

    // El orquestador notificó al equipo: handoff, la conversación se congela.
    if (orch.notification.notified) {
      const category = orch.notification.category ?? "fuera_de_conocimiento";
      const escalationIsNew = await recordNotification({
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
      // Mail al equipo: SOLO si la derivacion es nueva (recordNotification
      // hace dedupe por categoria/conversacion). Sin esto, si el agente
      // sigue charlando tras derivar y vuelve a notify_team la misma
      // categoria, mandariamos mail duplicado.
      if (escalationIsNew) {
        await sendEscalationEmailForConv({
          conversationId: input.conversationId,
          category,
          reason: orch.notification.reason,
          summary: orch.notification.summary,
        });
      }
      // Derivación: si el orquestador generó un texto junto con el
      // notify_team (caso típico: cierre de servicio técnico con el
      // teléfono, o cierre de interes_compra anunciando que Santino
      // contacta), se lo mandamos al cliente. Si no generó texto
      // (escalation silenciosa, ej. cliente_existente sin contexto
      // adicional o arquitecto_desarrollador), NO mandamos nada y la
      // notificación interna alcanza.
      const handoffText = orch.responseText?.trim() ?? "";
      return {
        traceId,
        assistantMessage:
          handoffText || handoffFallbackNotice(timeContext.followUpTiming),
        status: "escalated",
        escalationReason: category,
        escalationIsNew,
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
    lastResponseText = orch.responseText;
    lastEvaluation = {
      failedCriteria: evaluation.failedCriteria,
      suggestion: evaluation.suggestion,
    };
  }

  // 3. Se agotaron las iteraciones sin una respuesta validada. Distinguir:
  //
  //    a) **Rechazo CRÍTICO**: el evaluator se quejó por algo de grounding
  //       real (precio falso, URL inventada, feature mal atribuida) o no_revela_ia.
  //       En ese caso derivamos a humano: la IA no puede sostener la respuesta.
  //
  //    b) **Rechazo NO CRÍTICO**: el evaluator se quejó por cosas vagas
  //       (presentación, estructura, flujo, coaching). Esto es ruido del
  //       evaluator, no un problema real con la respuesta. Enviamos la
  //       última respuesta del orchestrator igual + log warning (sin
  //       notificar al equipo, sin crear lead). Premisa: el evaluator se
  //       equivoca a menudo; un cliente sin respuesta es peor.
  const lastEvaluationSafe = lastEvaluation ?? { failedCriteria: [], suggestion: null };
  const isCriticalReject = isCriticalRejectByEvaluator(lastEvaluationSafe);

  if (!isCriticalReject && lastResponseText) {
    console.warn(
      `[run] Tras ${iterationsRun} iteraciones el evaluator sigue rechazando ` +
        `por motivos NO críticos (${lastEvaluationSafe.failedCriteria.join(",")}). ` +
        `Envío la última respuesta al cliente igual. trace=${traceId}. ` +
        `Suggestion: ${lastEvaluationSafe.suggestion?.slice(0, 200)}`,
    );
    await finalizeTrace(traceId, {
      status: "completed",
      iterations: iterationsRun,
      totalInput,
      totalOutput,
      totalLatency,
      evaluatorPassed: false,
      escalationReason: null,
    });
    await dispatchEvent("agent.responded", {
      conversationId: input.conversationId,
      traceId,
      message: lastResponseText,
    });
    return {
      traceId,
      assistantMessage: lastResponseText,
      status: "completed",
    };
  }

  // Crítico (o no hay última respuesta para enviar): derivar.
  const category: NotificationCategory = "fuera_de_conocimiento";
  const reason = `Agente bloqueado: el evaluator rechazo ${iterationsRun} veces seguidas con motivo critico.`;
  const summary = [
    `Consulta del cliente: "${input.userMessage}"`,
    "",
    `El agente intento responder ${iterationsRun} veces y el evaluator rechazo cada intento por un motivo critico de grounding o identidad.`,
    evaluatorFeedback
      ? `Ultimo feedback del evaluator: ${evaluatorFeedback}`
      : "Sin feedback registrado.",
    "",
    "Requiere respuesta directa de un asesor humano.",
  ].join("\n");
  const escalationIsNew = await recordNotification({
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
    reason: "max_iterations_sin_respuesta_validada_critica",
  });
  if (escalationIsNew) {
    await sendEscalationEmailForConv({
      conversationId: input.conversationId,
      category,
      reason,
      summary,
    });
  }
  return {
    traceId,
    assistantMessage: handoffFallbackNotice(timeContext.followUpTiming),
    status: "escalated",
    escalationReason: category,
    escalationIsNew,
  };
}

/**
 * Heurística: decidir si el rechazo del evaluator al agotarse las iteraciones
 * es crítico (debemos derivar) o no (podemos enviar la respuesta).
 *
 * **Crítico**:
 * - failedCriteria incluye `no_revela_ia` (siempre crítico).
 * - failedCriteria incluye `grounding` Y el suggestion menciona keywords
 *   concretos de KB falsos: precio numérico, URL/link, frases tipo "no figura
 *   en la KB", "distinto al de la KB", "inventad", "no existe".
 *
 * **NO crítico** (default):
 * - El evaluator se queja de cosas vagas: estructura, presentación, flujo,
 *   coaching, "prematuro", "podría ser más claro". Estos son los rechazos
 *   espurios que ya venimos viendo (evaluator haiku como cajón de sastre).
 *
 * En caso de duda, default = NO crítico (priorizamos enviar respuesta al
 * cliente sobre derivar por las dudas). Si esto deja pasar alguna
 * alucinación real, queda en logs del servidor para diagnosticar después.
 */
function isCriticalRejectByEvaluator(evaluation: {
  failedCriteria: string[];
  suggestion: string | null;
}): boolean {
  if (evaluation.failedCriteria.includes("no_revela_ia")) return true;
  if (!evaluation.failedCriteria.includes("grounding")) return false;
  if (!evaluation.suggestion) return false; // sin justificación = no crítico
  const s = evaluation.suggestion.toLowerCase();
  return (
    /\$\s?\d{1,3}([.,]\d{3})+/.test(s) || // precio en pesos: $1.990.000
    /usd\s?\d{2,3}([.,]\d{3})?/.test(s) || // precio en USD
    /(url|link|drive\.google|brochure).*(inventad|incorrect|falso|no es|distint)/.test(s) ||
    /no figura en la kb/.test(s) ||
    /no est[áa] en la kb/.test(s) ||
    /no aparece en la kb/.test(s) ||
    /distint[oa] al? de la kb/.test(s) ||
    /no existe en la kb/.test(s) ||
    /feature.*(inventad|inexistent|no es)/.test(s) ||
    /(precio|modelo|garant[ií]a|env[ií]o).*(no figura|no est[áa]|inventad|incorrect|falso)/.test(s)
  );
}

// --- helpers ---------------------------------------------------------------

/**
 * Wrapper de sendEscalationEmail que enriquece el payload con datos de la
 * conversation (nombre del lead, kommo_lead_id para el link) consultando
 * Supabase. Catch global: si el lookup o el SMTP fallan, log y seguimos.
 */
async function sendEscalationEmailForConv(args: {
  conversationId: string;
  category: string;
  reason: string | null;
  summary: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { data: conv } = await supabase
      .from("conversations")
      .select("display_name, kommo_lead_id, kommo_contact_id")
      .eq("id", args.conversationId)
      .maybeSingle();
    // Lookup del telefono en Kommo. El webhook nativo no manda
    // author[phone], asi que toca pedirlo. Best-effort: si falla, mail
    // sale sin telefono igual.
    let leadPhone: string | null = null;
    if (conv?.kommo_contact_id) {
      try {
        const contact = await getContact(conv.kommo_contact_id);
        leadPhone = getContactPhone(contact);
      } catch (err) {
        console.warn("[run] no se pudo traer telefono del contacto:", err);
      }
    }
    await sendEscalationEmail({
      category: args.category,
      reason: args.reason,
      summary: args.summary,
      conversationId: args.conversationId,
      leadDisplayName: conv?.display_name ?? null,
      leadPhone,
      kommoLeadId: conv?.kommo_lead_id ?? null,
      appUrl:
        process.env.NEXT_PUBLIC_APP_URL ?? "https://atp-ibath.vercel.app",
    });
  } catch (err) {
    console.error("[run] error enviando mail de derivacion:", err);
  }
}

/**
 * Registra una notificación al equipo de ventas. Devuelve `true` si insertó
 * una notificación nueva, `false` si ya existía una de la misma categoría
 * para esta conversación (dedupe: evita avisar/emailar dos veces por el
 * mismo motivo cuando el agente sigue conversando tras derivar).
 */
async function recordNotification(args: {
  traceId: string;
  conversationId: string;
  category: NotificationCategory;
  reason: string | null;
  summary: string | null;
}): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient();
    const { count } = await supabase
      .from("agent_notifications")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", args.conversationId)
      .eq("category", args.category);
    if ((count ?? 0) > 0) return false;

    await supabase.from("agent_notifications").insert({
      conversation_id: args.conversationId,
      trace_id: args.traceId,
      category: args.category,
      reason: args.reason,
      summary: args.summary,
    });
    return true;
  } catch (err) {
    console.error("[run] no se pudo registrar la notificación:", err);
    return false;
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
