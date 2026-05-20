import "server-only";

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { serverEnv } from "@/lib/env";
import { loadPrompt } from "./prompts";
import { buildPanelToolServer, PANEL_TOOL_NAMES } from "./tools";
import { createTraceLoggerHooks } from "./hooks/trace-logger";
import { usageToTotals } from "./hooks/token-tracker";
import { timeContextBlock, type TimeContext } from "./business-hours";
import type { HistoryMessage, OrchestratorResult, RunContext } from "./types";

// ===========================================================================
// Orquestador (agente IBATH).
//
// Corre UNA iteracion del asesor comercial como una sesion del Claude Agent
// SDK. El SDK maneja el loop interno de tool-use; el loop EXTERNO de
// reintentos con el evaluator vive en run.ts.
// ===========================================================================

const ORCHESTRATOR_MAX_TURNS = 12;

/** System prompt = instrucciones del asesor + base de conocimiento. */
function buildSystemPrompt(): string {
  return (
    loadPrompt("orchestrator") +
    "\n\n# BASE DE CONOCIMIENTO\n\n" +
    loadPrompt("knowledge-base")
  );
}

/** Arma el prompt del turno: contexto + historial + mensaje + feedback. */
function buildTurnPrompt(params: {
  userMessage: string;
  history: HistoryMessage[];
  evaluatorFeedback: string | null;
  timeContext: TimeContext;
  customerMessageCount: number;
}): string {
  const lines: string[] = [];

  lines.push(timeContextBlock(params.timeContext));
  lines.push("");
  lines.push(
    `=== Actividad del cliente ===\n` +
      `El cliente envió ${params.customerMessageCount} mensaje(s) en esta ` +
      `conversación (contando el actual). Usalo como guía para el disparador ` +
      `de interés de compra.`,
  );
  lines.push("");

  if (params.history.length > 0) {
    lines.push("=== Historial de la conversación ===");
    for (const m of params.history) {
      const who =
        m.role === "user"
          ? "Cliente"
          : m.role === "assistant"
            ? "Asesor"
            : m.role === "human"
              ? "Asesor humano"
              : "Sistema";
      lines.push(`${who}: ${m.content}`);
    }
    lines.push("");
  }

  lines.push("=== Mensaje actual del cliente ===");
  lines.push(params.userMessage);

  if (params.evaluatorFeedback) {
    lines.push("");
    lines.push("=== Corrección requerida ===");
    lines.push(
      "Tu respuesta anterior NO pasó la validación. Generala de nuevo " +
        "corrigiendo esto:",
    );
    lines.push(params.evaluatorFeedback);
  }

  return lines.join("\n");
}

/**
 * Corre una iteración del orquestador. Devuelve la respuesta propuesta y las
 * métricas. Lanza si el SDK termina con error duro (run.ts lo captura).
 */
export async function runOrchestrator(params: {
  ctx: RunContext;
  userMessage: string;
  history: HistoryMessage[];
  evaluatorFeedback: string | null;
  timeContext: TimeContext;
  customerMessageCount: number;
}): Promise<OrchestratorResult> {
  const env = serverEnv();
  const { ctx } = params;
  const model = env.ANTHROPIC_MODEL_ORCHESTRATOR;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), env.AGENT_TIMEOUT_MS);
  const startedAt = Date.now();

  const options: Options = {
    systemPrompt: buildSystemPrompt(),
    model,
    maxTurns: ORCHESTRATOR_MAX_TURNS,
    // Tools propias del panel (MCP in-process).
    mcpServers: { panel: buildPanelToolServer(ctx) },
    // Sin tools built-in: el agente no accede a Bash/Read/Write/etc.
    tools: [],
    allowedTools: [...PANEL_TOOL_NAMES],
    // trace-logger: registra cada tool en agent_trace_steps.
    hooks: createTraceLoggerHooks(ctx),
    // Corrida autónoma server-side, sin prompts de permiso.
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: [],
    abortController,
    includePartialMessages: false,
  };

  let responseText = "";
  let usage: unknown = null;

  try {
    for await (const message of query({
      prompt: buildTurnPrompt(params),
      options,
    })) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          responseText = message.result;
          usage = message.usage;
        } else {
          throw new Error(
            `El orquestador terminó con estado de error: ${message.subtype}`,
          );
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const totals = usageToTotals(usage);

  return {
    responseText: responseText.trim(),
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    latencyMs: Date.now() - startedAt,
    model,
    notification: ctx.notification,
  };
}
