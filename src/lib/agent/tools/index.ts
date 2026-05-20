import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { RunContext } from "../types";
import { createNotifyTeamTool, NOTIFY_TOOL_NAME } from "./notify_team";

// Registry de tools propias del panel.
//
// Las tools se sirven como un MCP server in-process del Agent SDK. El modelo
// las ve con el prefijo `mcp__<server>__<tool>`.
//
// Para agregar una tool: crear el archivo con `tool(...)` y sumarla al array
// `tools` de buildPanelToolServer.

export const PANEL_TOOL_SERVER_NAME = "panel";

/** Nombre completo (como lo ve el modelo) de cada tool del panel. */
export const PANEL_TOOL_NAMES = [
  `mcp__${PANEL_TOOL_SERVER_NAME}__${NOTIFY_TOOL_NAME}`,
];

/**
 * Construye el MCP server con las tools del panel para una corrida concreta.
 * Es por-corrida porque las tools necesitan el RunContext.
 */
export function buildPanelToolServer(ctx: RunContext) {
  return createSdkMcpServer({
    name: PANEL_TOOL_SERVER_NAME,
    version: "1.0.0",
    tools: [createNotifyTeamTool(ctx)],
  });
}
