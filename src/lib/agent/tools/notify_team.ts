import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { RunContext } from "../types";

// ===========================================================================
// Tool `notify_team`.
//
// El orquestador la invoca apenas detecta un disparador (ver orchestrator.md).
// Notificar = entregar la conversación a un humano: la conversación queda
// "congelada" (el agente no responde más) y el equipo toma el control.
//
// La categoría es texto libre (snake_case): cada cliente define las suyas
// en el prompt del orquestador. El worker tiene etiquetas legibles para las
// categorías comunes y un fallback que humaniza el snake_case.
//
// Es un factory porque el handler necesita el RunContext de la corrida actual
// para señalizar la notificación. run.ts la lee después de que la sesión del
// SDK termina y registra la notificación + congela la conversación.
// ===========================================================================

export const NOTIFY_TOOL_NAME = "notify_team";

export function createNotifyTeamTool(ctx: RunContext) {
  return tool(
    NOTIFY_TOOL_NAME,
    "Notifica al equipo y entrega la conversación a un humano. Invocala " +
      "apenas se cumpla cualquiera de los disparadores definidos en tus " +
      "instrucciones. Después de llamarla, despedite con UN solo mensaje " +
      "breve y cordial y no respondas ninguna consulta más.",
    {
      category: z
        .string()
        .min(1)
        .describe(
          "Categoría de la notificación en snake_case. Ejemplos comunes: " +
            "'interes_compra', 'cliente_existente', 'fuera_de_conocimiento', " +
            "'escalado_manual'. Usá las categorías propias del cliente que " +
            "estén definidas en el prompt del orquestador.",
        ),
      reason: z
        .string()
        .min(1)
        .describe("Explicación breve del disparador detectado."),
      summary: z
        .string()
        .min(1)
        .describe(
          "Resumen para el equipo: qué necesita el cliente y el contexto " +
            "útil para que pueda continuar la conversación.",
        ),
    },
    async (args) => {
      ctx.notification.notified = true;
      ctx.notification.category = args.category;
      ctx.notification.reason = args.reason;
      ctx.notification.summary = args.summary;
      return {
        content: [
          {
            type: "text" as const,
            text:
              "Equipo notificado. La conversación queda en manos de un humano. " +
              "Despedite con un único mensaje breve y cordial; no respondas " +
              "ninguna consulta más.",
          },
        ],
      };
    },
  );
}
