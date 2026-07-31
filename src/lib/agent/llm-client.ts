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
    // OpenRouter autentica con `Authorization: Bearer <key>` (estilo
    // OpenAI). El SDK de Anthropic, si le pasas `apiKey`, envia
    // `x-api-key` (formato Anthropic) — que OpenRouter no reconoce y
    // responde 401 "Missing Authentication header". Pasandole `authToken`
    // en lugar de `apiKey`, el SDK usa nativamente `Authorization: Bearer`
    // (ver line 348 del SDK client.js). No conviene pasar ambos: el SDK
    // rechaza el conflicto de auth.
    cached = new Anthropic({
      authToken: env.OPENROUTER_API_KEY!,
      baseURL: OPENROUTER_BASE_URL,
    });
  } else {
    cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }
  return cached;
}
