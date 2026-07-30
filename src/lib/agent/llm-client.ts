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

// OpenRouter expone la Anthropic Messages API en /api/v1/messages. El SDK
// de Anthropic siempre agrega "/v1/messages" al baseURL, asi que el
// baseURL debe cortar en "/api" para que quede el path correcto (no
// /api/v1/v1/messages, que devuelve 404 con HTML de la landing).
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const env = serverEnv();
  if (env.LLM_PROVIDER === "openrouter") {
    // El refine de env.ts garantiza que OPENROUTER_API_KEY esta cuando
    // LLM_PROVIDER=openrouter. Este ! lo confirma para TS.
    //
    // El SDK de Anthropic autentica con el header `x-api-key`, pero
    // OpenRouter espera `Authorization: Bearer <key>` (estilo OpenAI).
    // Sin ese header, el gateway responde 401 "Missing Authentication
    // header". Lo sumamos manualmente via defaultHeaders para que
    // ambos headers viajen en cada request.
    const key = env.OPENROUTER_API_KEY!;
    cached = new Anthropic({
      apiKey: key,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        Authorization: `Bearer ${key}`,
      },
    });
  } else {
    cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }
  return cached;
}
