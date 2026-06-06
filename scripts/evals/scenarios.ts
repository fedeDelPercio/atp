// ===========================================================================
// Escenarios de eval del agente de Quintaglia (Mica).
//
// Cada escenario es una conversación multi-turno. El historial se acumula
// entre turnos (igual que en producción). Las expectativas (`expect`) se
// chequean contra lo que vería el cliente.
//
// La mayoría codifica bugs concretos o reglas explícitas del prompt para que
// no se rompan en silencio: identidad Team Scaglia, plazo sin hedges,
// ubicación correcta, cierres comerciales, reactividad de cochera/plazo,
// flujo de precios, propuesta de llamada directa.
// ===========================================================================

import type { Expect } from "./assert";

export interface Turn {
  user: string;
  expect?: Expect;
}

export interface Scenario {
  name: string;
  /** ISO con offset. Default: viernes 2026-05-29 11:00 ART (dentro de horario). */
  now: string;
  isExistingCustomer?: boolean;
  turns: Turn[];
}

const VIERNES_DENTRO_HORARIO = "2026-05-29T11:00:00-03:00";

export const SCENARIOS: Scenario[] = [
  {
    name: "Apertura: 3 bloques + Team Scaglia (NO 'equipo de Quintaglia')",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      {
        user: "hola",
        expect: {
          doesNotNotify: true,
          contains: ["Team Scaglia", "---"],
          notContains: [
            "equipo de Quintaglia",
            "equipo comercial de Quintaglia",
          ],
          custom: (out) => {
            // Apertura: 3 bloques separados por --- (mínimo 2 --- ⇒ 3 bloques).
            const sep = (out.responseText.match(/\n---\n/g) ?? []).length;
            if (sep < 2)
              return `apertura debería tener 3 bloques separados por '---' (encontré ${sep} separadores)`;
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Plazo de entrega: confiado, sin hedges ('estimado', 'puede variar')",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola, quiero info del proyecto" },
      {
        user: "cuándo lo entregan?",
        expect: {
          doesNotNotify: true,
          contains: ["segundo semestre", "2028"],
          notContains: [
            "estimado",
            "estimada",
            "puede variar",
            "tentativa",
            "aunque",
            "aproximada",
          ],
        },
      },
    ],
  },

  {
    name: "Ubicación: esquina 3 de Feb y Congreso (Núñez/Belgrano son zonas)",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "dónde queda el edificio?",
        expect: {
          doesNotNotify: true,
          contains: ["3 de Febrero", "Congreso"],
          notContains: [
            "esquina de Núñez",
            "esquina de Belgrano",
            "esquina Núñez",
            "esquina Belgrano",
          ],
        },
      },
    ],
  },

  {
    name: "Cierre comercial natural (NO 'alguna otra consulta?')",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "qué tipo de unidades tienen?",
        expect: {
          doesNotNotify: true,
          notContains: [
            "alguna otra consulta",
            "algo más en lo que te pueda ayudar",
            "quedo a disposición",
            "te puedo contar más del proyecto",
          ],
        },
      },
    ],
  },

  {
    name: "Cochera NO proactiva al describir el proyecto",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "contame qué amenities tiene el edificio",
        expect: {
          doesNotNotify: true,
          notContains: ["cochera", "estacionamiento", "garage"],
        },
      },
    ],
  },

  {
    name: "Cochera SÍ reactiva cuando preguntan directo",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "tiene cochera?",
        expect: {
          doesNotNotify: true,
          contains: ["sin cochera"],
        },
      },
    ],
  },

  {
    name: "Precio: lista oficial + propuesta de llamada, sin enumerar",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "cuánto sale el 3°C?",
        expect: {
          doesNotNotify: true,
          contains: ["lista", "drive.google.com"],
          custom: (out) => {
            // No enumerar precios puntuales. Detectamos formatos típicos:
            // "USD 95.000", "$95.000", "U$D 95.034", etc.
            if (/u\$?s?d?\s*\$?\s*\d{2,3}[.,]\d{3}/i.test(out.responseText))
              return "enumera un precio puntual en chat (debería solo compartir la lista)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Define tipología → propuesta de llamada directa (no califica antes)",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola, quiero info" },
      {
        user: "me interesa un 2 ambientes",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Debe ofrecer la llamada en este turno.
            if (!/llamad|asesor|contact/.test(lower))
              return "no propone la llamada cuando el lead define tipología";
            // No debe abrir con "vivienda o inversión?" antes de proponer.
            if (
              /(vivienda|inversi[oó]n|para vivir).*\?/i.test(out.responseText) &&
              !/llamad|asesor|contact/.test(
                out.responseText.toLowerCase().split("?")[0] ?? "",
              )
            ) {
              return "abre con calificación 'vivienda o inversión' antes de proponer la llamada";
            }
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Acepta llamada → pregunta horario antes de notify_team",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      { user: "me interesa un 2 ambientes" },
      {
        user: "dale, llamame",
        expect: {
          // En este turno todavía NO debe derivar: tiene que pedir horario
          // antes (mañana / tarde). El notify llega cuando responde el horario.
          doesNotNotify: true,
          contains: ["mañana", "tarde"],
        },
      },
    ],
  },

  {
    name: "Cliente existente: deriva inmediato sin flow comercial",
    now: VIERNES_DENTRO_HORARIO,
    isExistingCustomer: true,
    turns: [
      {
        user: "hola, una consulta",
        expect: {
          notifies: "cliente_existente",
        },
      },
    ],
  },
];
