import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { RunContext } from "../types";

// ===========================================================================
// Tool `notify_team`.
//
// El orquestador la invoca apenas detecta un disparador (ver orchestrator.md).
// Notificar = entregar la conversacion a un humano: la conversacion se
// "congela" (el agente no responde mas) y el vendedor toma el control.
//
// Es un factory porque el handler necesita el RunContext de la corrida actual
// para senializar la notificacion. run.ts la lee despues de que la sesion del
// SDK termina y registra la notificacion + congela la conversacion.
// ===========================================================================

export const NOTIFY_TOOL_NAME = "notify_team";

export function createNotifyTeamTool(ctx: RunContext) {
  return tool(
    NOTIFY_TOOL_NAME,
    "Notifica al equipo de ventas y entrega la conversacion a un asesor humano. " +
      "Invocala apenas se cumpla cualquiera de los disparadores definidos en tus " +
      "instrucciones. Despues de llamarla, despedite con UN solo mensaje breve y " +
      "cordial y no respondas ninguna consulta mas.",
    {
      category: z
        .enum([
          "arquitecto_desarrollador",
          "cantidad_equipos",
          "interes_compra",
          "cliente_existente",
          "fuera_de_conocimiento",
        ])
        .describe("Motivo por el que se notifica al equipo."),
      reason: z
        .string()
        .min(1)
        .describe("Explicacion breve del disparador detectado."),
      summary: z
        .string()
        .min(1)
        .describe(
          "Resumen para el vendedor: que necesita el cliente y el contexto util " +
            "para que pueda continuar la conversacion.",
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
              "Equipo de ventas notificado. La conversacion queda en manos de un " +
              "asesor. Despedite con un unico mensaje breve y cordial; no respondas " +
              "ninguna consulta mas.",
          },
        ],
      };
    },
  );
}
