import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Registry de subagentes.
//
// El agente IBATH (fase 1) no usa subagentes: el orquestador + el evaluator
// alcanzan. El registry queda preparado para cuando haga falta uno.
//
// Para agregar un subagente: crear su archivo con un `AgentDefinition`, un
// `.md` de prompt, y sumarlo al mapa de buildAgentsMap().

export function buildAgentsMap(): Record<string, AgentDefinition> {
  return {};
}

/** true si hay al menos un subagente registrado. */
export function hasSubagents(): boolean {
  return Object.keys(buildAgentsMap()).length > 0;
}
