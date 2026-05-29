// ===========================================================================
// Escenarios de eval del agente de iBath.
//
// Cada escenario es una conversación multi-turno. El historial y la categoría
// de derivación se acumulan entre turnos (igual que en producción). Las
// expectativas (`expect`) se chequean contra lo que vería el cliente.
//
// La mayoría codifica bugs concretos que encontramos testeando a mano, para
// que no vuelvan: escalado de "hola", Santino repetido, "?" en la oferta,
// descuento mal atribuido, presión/tanque proactivo, etc.
// ===========================================================================

import type { Expect } from "./assert";

export interface Turn {
  user: string;
  expect?: Expect;
}

export interface Scenario {
  name: string;
  /** ISO con offset. Hoy: viernes 2026-05-29 09:37 ART -> timing "por la tarde". */
  now: string;
  isExistingCustomer?: boolean;
  turns: Turn[];
}

const VIERNES_MANANA = "2026-05-29T09:37:00-03:00";

export const SCENARIOS: Scenario[] = [
  {
    name: "Saludo seco no escala (regresión: 'hola' se derivaba al equipo)",
    now: VIERNES_MANANA,
    turns: [
      {
        user: "hola",
        expect: {
          doesNotNotify: true,
          contains: ["asistente de iBath"],
        },
      },
    ],
  },

  {
    name: "Oferta de llamada: afirmación sin '?' ni hablar de 'cerrar'",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info de los inodoros inteligentes" },
      { user: "qué diferencias hay entre el Ombú y el Ceibo?" },
      {
        user: "buenísimo, me interesa para mi casa",
        expect: {
          custom: (out) => {
            if (!/santino/i.test(out.responseText)) return null; // no ofreció: ok
            if (out.responseText.trimEnd().endsWith("?"))
              return "la oferta de llamada termina en '?' (debería ser afirmación)";
            if (/cerrar/i.test(out.responseText))
              return "la oferta de llamada habla de 'cerrar' (espanta leads)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Arquitecto/desarrollador: cierre directo a Santino, una sola vez",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info de los inodoros inteligentes" },
      {
        user: "es para una construcción que estoy diseñando con la constructora Solar en Pilar",
        expect: {
          notifies: "arquitecto_desarrollador",
          contains: ["Santino", "por la tarde"],
          notContains: ["cerrar"],
          santinoCountMax: 1,
          notEndsWithQuestion: true,
          custom: (out) => {
            // No alcanza un acuse vacío tipo "Entendido, un proyecto en Pilar":
            // tiene que comprometer el contacto.
            if (!/contact|coordin|asesor/i.test(out.responseText))
              return "no compromete el contacto de Santino (acuse vacío)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Precio general: franja + descuento sin atribuirlo al Ceibo",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola" },
      {
        user: "qué precios manejan?",
        expect: {
          // Para precio general el speech "uno de nuestros modelos tiene
          // descuento" (sin nombrarlo) es correcto. Verificamos el techo de la
          // franja ($2.300.000, consistente en la KB) y que no derive. OJO: el
          // piso oscila entre $1.200.000 y $1.990.000 por una inconsistencia
          // en la KB (la frase canónica dice 1.200.000 pero el Ombú vale
          // 1.990.000); por eso no lo asertamos hasta resolver el dato.
          doesNotNotify: true,
          contains: ["$2.300.000"],
        },
      },
    ],
  },

  {
    name: "Descuento solo Ombú: preguntan Ceibo, no inventa descuento",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola" },
      {
        user: "cuánto sale el Ceibo?",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            // Bug: atribuir descuento al Ceibo. Si habla de descuento, debe
            // aclarar que es del Ombú (no del Ceibo).
            if (/descuento/i.test(out.responseText) && !/omb[úu]/i.test(out.responseText))
              return "atribuye descuento al Ceibo (solo el Ombú tiene)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Presión/tanque NO proactivo al comparar modelos",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info de los inodoros inteligentes" },
      {
        user: "qué diferencias hay entre los modelos?",
        expect: {
          doesNotNotify: true,
          notContains: ["presión", "tanque", "bomba"],
        },
      },
    ],
  },

  {
    name: "Presión/tanque SÍ reactivo cuando preguntan explícito",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola" },
      {
        user: "qué presión de red necesito para que funcione bien?",
        expect: {
          doesNotNotify: true,
          contains: ["presión"],
        },
      },
    ],
  },

  {
    name: "Post-derivación: 'muchas gracias' cierra cordial sin repetir Santino",
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info de los inodoros inteligentes" },
      {
        user: "es para un proyecto con la constructora Solar en Pilar",
      },
      {
        user: "muchas gracias",
        expect: {
          doesNotNotify: true,
          santinoCountMax: 0,
          notContains: ["va a estar contactando", "te va a llamar", "se contacta con vos"],
        },
      },
    ],
  },
];
