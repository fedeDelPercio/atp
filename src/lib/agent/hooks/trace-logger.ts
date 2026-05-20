import "server-only";

import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
} from "@anthropic-ai/claude-agent-sdk";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import type { RunContext } from "../types";
import type { Json, StepType } from "@/lib/supabase/types";

// ===========================================================================
// Hook trace-logger.
//
// Engancha PostToolUse / PostToolUseFailure del Agent SDK y registra una fila
// en `agent_trace_steps` por cada tool o subagente que ejecuta el orquestador.
// PostToolUse ya trae `duration_ms`, asi que no hace falta correlacionar con
// PreToolUse.
//
// Nota: el paso del orquestador en si (con sus tokens) y el del evaluator se
// registran aparte (en run.ts y evaluator.ts respectivamente). Este hook solo
// cubre tools y subagentes. Los tokens por subagente no son atribuibles desde
// el hook, por eso quedan en 0; el total de tokens del trace lo aporta el
// mensaje `result` del SDK (ver token-tracker.ts).
// ===========================================================================

function toJson(value: unknown): Json | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

/** Determina tipo, nombre y modelo del step segun el nombre de la tool. */
function classifyTool(
  toolName: string,
  toolInput: unknown,
): { stepType: StepType; stepName: string; model: string } {
  // Los subagentes se invocan via la tool built-in `Agent` (alias `Task`).
  if (toolName === "Agent" || toolName === "Task") {
    const sub = (toolInput as { subagent_type?: string } | null)?.subagent_type;
    return {
      stepType: "subagent",
      stepName: sub ?? "subagent",
      model: serverEnv().ANTHROPIC_MODEL_SUBAGENT,
    };
  }
  // Tools propias del panel: mcp__<server>__<tool>.
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    return { stepType: "tool", stepName: parts[parts.length - 1] ?? toolName, model: "-" };
  }
  return { stepType: "tool", stepName: toolName, model: "-" };
}

/**
 * Construye los hooks de trace-logging para una corrida concreta.
 * El RunContext aporta el traceId, la iteracion y el contador de step_order.
 */
export function createTraceLoggerHooks(
  ctx: RunContext,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  async function logStep(args: {
    toolName: string;
    toolInput: unknown;
    toolOutput: unknown;
    durationMs: number | undefined;
    error: string | null;
  }): Promise<void> {
    const { stepType, stepName, model } = classifyTool(args.toolName, args.toolInput);
    try {
      await getSupabaseServerClient()
        .from("agent_trace_steps")
        .insert({
          trace_id: ctx.traceId,
          step_order: ctx.stepOrder++,
          step_type: stepType,
          step_name: stepName,
          iteration: ctx.iteration,
          model,
          provider: "anthropic",
          input: toJson(args.toolInput),
          output: toJson(args.toolOutput),
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: Math.round(args.durationMs ?? 0),
          error: args.error,
        });
    } catch (err) {
      // El logging del trace nunca debe tumbar la corrida del agente.
      console.error("[trace-logger] no se pudo registrar el step:", err);
    }
  }

  const onPostToolUse: HookCallback = async (input) => {
    if (input.hook_event_name === "PostToolUse") {
      await logStep({
        toolName: input.tool_name,
        toolInput: input.tool_input,
        toolOutput: input.tool_response,
        durationMs: input.duration_ms,
        error: null,
      });
    }
    return { continue: true };
  };

  const onPostToolUseFailure: HookCallback = async (input) => {
    if (input.hook_event_name === "PostToolUseFailure") {
      await logStep({
        toolName: input.tool_name,
        toolInput: input.tool_input,
        toolOutput: null,
        durationMs: input.duration_ms,
        error: input.error,
      });
    }
    return { continue: true };
  };

  return {
    PostToolUse: [{ hooks: [onPostToolUse] }],
    PostToolUseFailure: [{ hooks: [onPostToolUseFailure] }],
  };
}
