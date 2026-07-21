import "server-only";

import { serverEnv } from "@/lib/env";
import type { Provider } from "@/lib/supabase/types";

// ===========================================================================
// Helpers de seleccion de modelo por rol, condicionados al LLM_PROVIDER
// activo. Todo el codigo del agente lee los model IDs y el provider desde
// aca en vez de tocar env directo, asi el toggle es un solo cambio.
//
// - LLM_PROVIDER=anthropic  -> usa ANTHROPIC_MODEL_* (claude-sonnet-4-6, ...)
// - LLM_PROVIDER=openrouter -> usa OPENROUTER_MODEL_* (anthropic/claude-...)
//
// El SDK de Anthropic corre igual contra el endpoint compatible de
// OpenRouter (ver llm-client.ts). Solo cambia baseURL + apiKey + IDs.
// ===========================================================================

export function currentProvider(): Provider {
  return serverEnv().LLM_PROVIDER;
}

export function modelForOrchestrator(): string {
  const env = serverEnv();
  return env.LLM_PROVIDER === "openrouter"
    ? env.OPENROUTER_MODEL_ORCHESTRATOR
    : env.ANTHROPIC_MODEL_ORCHESTRATOR;
}

export function modelForSubagent(): string {
  const env = serverEnv();
  return env.LLM_PROVIDER === "openrouter"
    ? env.OPENROUTER_MODEL_SUBAGENT
    : env.ANTHROPIC_MODEL_SUBAGENT;
}

export function modelForEvaluator(): string {
  const env = serverEnv();
  return env.LLM_PROVIDER === "openrouter"
    ? env.OPENROUTER_MODEL_EVALUATOR
    : env.ANTHROPIC_MODEL_EVALUATOR;
}
