import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

// ===========================================================================
// Cliente LLM (modo directo, sin Agent SDK).
//
// Usa el SDK de Anthropic tanto para Anthropic directo como para OpenRouter:
// OpenRouter expone un endpoint compatible en /v1/messages con el mismo
// payload shape que la Messages API de Anthropic, asi que solo cambia
// baseURL + apiKey y el SDK sigue funcionando sin tocar nada mas.
//
// El toggle se hace via LLM_PROVIDER (ver env.ts + models.ts).
// ===========================================================================

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const env = serverEnv();
  if (env.LLM_PROVIDER === "openrouter") {
    // El refine de env.ts garantiza que OPENROUTER_API_KEY esta cuando
    // LLM_PROVIDER=openrouter. Este ! lo confirma para TS.
    cached = new Anthropic({
      apiKey: env.OPENROUTER_API_KEY!,
      baseURL: OPENROUTER_BASE_URL,
    });
  } else {
    cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }
  return cached;
}
