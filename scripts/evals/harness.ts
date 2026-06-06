// ===========================================================================
// Harness de evals: corre el orquestador REAL (mismo prompt, mismo modelo,
// mismo armado) contra escenarios definidos en scenarios.ts.
//
// Comparte el armado del prompt con producción via prompt-builder.ts (single
// source of truth). Quintaglia no tiene capa de sanitize ni handoff fallback
// con texto (cuando notifica sin texto, el cliente NO recibe nada visible),
// así que el harness refleja eso: responseText viene tal cual del modelo.
//
// NO cubre el loop del evaluator (eso es v2): evalúa lo que GENERA el
// orquestador, que es donde vive el comportamiento del prompt.
// ===========================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { getTimeContext } from "../../src/lib/agent/business-hours";
import { buildSystemPrompt, buildMessages } from "../../src/lib/agent/prompt-builder";
import {
  NOTIFY_TEAM_TOOL_NAME,
  NOTIFY_TEAM_TOOL_SCHEMA,
  type NotifyTeamArgs,
} from "../../src/lib/agent/tools/notify_team";
import type { HistoryMessage } from "../../src/lib/agent/types";

// Igual que ORCHESTRATOR_MAX_TOKENS en orchestrator.ts (valor estable).
const MAX_TOKENS = 2048;

const PROMPTS_DIR = join(process.cwd(), "src", "lib", "agent", "prompts");
const ORCHESTRATOR_PROMPT = readFileSync(join(PROMPTS_DIR, "orchestrator.md"), "utf8");
const KNOWLEDGE_BASE = readFileSync(join(PROMPTS_DIR, "knowledge-base.md"), "utf8");

const MODEL = process.env.ANTHROPIC_MODEL_ORCHESTRATOR ?? "claude-sonnet-4-6";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta ANTHROPIC_API_KEY. Cargá .env.local (run.ts importa ./env primero).",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface EvalTurnInput {
  history: HistoryMessage[];
  userMessage: string;
  now: Date;
  customerMessageCount: number;
  isExistingCustomer: boolean;
}

export interface EvalTurnOutput {
  /** Texto final que vería el cliente (vacío si notificó sin texto). */
  responseText: string;
  /** true si el orquestador llamó notify_team. */
  notified: boolean;
  /** Categoría de la notificación (o null). */
  category: string | null;
  /** Modelo usado en esta corrida. */
  model: string;
}

/** Corre UN turno del orquestador real y devuelve lo que vería el cliente. */
export async function runOrchestratorEval(
  input: EvalTurnInput,
): Promise<EvalTurnOutput> {
  const timeContext = getTimeContext(input.now);

  const system = buildSystemPrompt({
    orchestratorPrompt: ORCHESTRATOR_PROMPT,
    knowledgeBase: KNOWLEDGE_BASE,
    timeContext,
    customerMessageCount: input.customerMessageCount,
    isExistingCustomer: input.isExistingCustomer,
  });

  const messages = buildMessages({
    userMessage: input.userMessage,
    history: input.history,
    evaluatorFeedback: null,
  });

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    tools: [NOTIFY_TEAM_TOOL_SCHEMA],
  });

  // Mirror del parse de orchestrator.ts: acumular texto + detectar notify_team.
  let responseText = "";
  let notified = false;
  let category: string | null = null;
  for (const block of response.content) {
    if (block.type === "text") {
      responseText += (responseText ? "\n" : "") + block.text;
    } else if (block.type === "tool_use" && block.name === NOTIFY_TEAM_TOOL_NAME) {
      const args = block.input as NotifyTeamArgs;
      notified = true;
      category = args.category;
    }
  }

  return {
    responseText: responseText.trim(),
    notified,
    category,
    model: MODEL,
  };
}
