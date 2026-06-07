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
          contains: ["cochera"],
          // El modelo varía ("sin cochera", "no incluyen cochera", "no
          // tiene cochera"): chequeamos que niegue claramente, sin amarrarnos
          // a un string específico.
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            if (
              !/(sin cochera|no incluye|no tiene cochera|no hay cochera|no cuentan con cochera)/.test(
                lower,
              )
            ) {
              return "no niega claramente la cochera";
            }
            return null;
          },
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
    name: "Acepta llamada → pregunta franja (mañana/tarde), NO día específico",
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      { user: "me interesa un 2 ambientes" },
      {
        user: "dale, llamame",
        expect: {
          // En este turno todavía NO debe derivar: tiene que pedir franja
          // antes. El notify llega cuando responde la franja.
          doesNotNotify: true,
          contains: ["por la mañana", "por la tarde"],
          // Bug visto en prod (sábado): el modelo mutaba a "mañana o durante
          // la semana", comprometiendo un día. La pregunta es de franja, no
          // de día.
          notContains: [
            "durante la semana",
            "esta semana",
            "el lunes",
            "el martes",
            "el miércoles",
            "el jueves",
            "el viernes",
            "el sábado",
            "el domingo",
            "el lunes que viene",
          ],
        },
      },
    ],
  },

  {
    name: "Acepta llamada un SÁBADO → sigue siendo franja, no día",
    // Regresión del bug visto en WhatsApp: el modelo, al ser sábado, mutó
    // la pregunta a "Preferís que te llamen mañana o durante la semana?",
    // comprometiendo un día (domingo) y deformando la franja en algo vago.
    // La regla del prompt es estricta: franja siempre, día nunca.
    now: "2026-05-30T12:00:00-03:00", // sábado mediodía
    turns: [
      { user: "hola" },
      { user: "me interesa un 2 ambientes" },
      {
        user: "dale, llamame",
        expect: {
          doesNotNotify: true,
          contains: ["por la mañana", "por la tarde"],
          notContains: [
            "durante la semana",
            "esta semana",
            "el lunes",
            "el martes",
            "el miércoles",
            "el jueves",
            "el viernes",
            "el sábado",
            "el domingo",
          ],
          custom: (out) => {
            // "mañana" sola (sin "por la") = día siguiente, NO franja.
            // Detectamos "mañana" no precedido por "por la".
            if (/(?<!por la )ma[ñn]ana(?! o)/i.test(out.responseText)) {
              // Solo fallar si NO viene precedida por "por la" — eso ya está
              // cubierto por contains. Esta regex extra cuida el caso "mañana
              // o..." al inicio.
              if (!/por la mañana/i.test(out.responseText)) {
                return "usa 'mañana' como día (debería ser 'por la mañana' como franja)";
              }
            }
            return null;
          },
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

  {
    name: "'Más info del monoambiente' → describe la tipología, NO manda lista de precios",
    // Bug visto en prod (2026-06-06): "quiero más info sobre el monoambiente"
    // termina derivado con fuera_de_conocimiento. Causa raíz: Mica responde
    // con info + lista de precios (porque interpreta "más info" como
    // "compartir todo"). El evaluator tiene la regla dura
    // estilo_lista_no_solicitada (lista solo si el cliente dice
    // cuánto/precio/sale/etc), rechaza, Mica reintenta, loop → max_iter →
    // fuera_de_conocimiento.
    //
    // El fix: el orchestrator NO debe mandar la lista cuando solo piden info.
    // Este escenario simula "después de apertura" (donde Mica ya pasó la
    // bienvenida) para chequear el comportamiento en el turno problema.
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "quiero mas informacion sobre el monoambiente",
        expect: {
          doesNotNotify: true,
          // NO debe mandar la URL de la lista de precios.
          notContains: [
            "1VmFe0NrlHUuAgGpMmGdDcbnr90LlkGTS",
            "lista oficial de precios",
            "lista de precios",
          ],
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Specs reales del monoambiente (m², ambientes, balcón, cocina,
            // baño, terminaciones). No exigimos la palabra "monoambient"
            // literal: el cliente ya la mencionó y Mica puede dar por
            // sentado el contexto.
            if (
              !/m[²2]|ambient|cubiert|balc[oó]n|estar|comedor|piso|cocin|ba[ñn]o|silestone|porcelanat|vin[ií]lic|radiante/.test(
                lower,
              )
            )
              return "no da información concreta de la tipología (solo saluda o redirige)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Lead da franja en 2 mensajes → cierre con acuse, NO repreguntar franja",
    // Bug visto en prod (2026-06-07, Nicolas): lead respondió
    // "Preferiría por la tarde" + "A partir de las 17hs" y Mica volvió a
    // preguntar "Perfecto. Preferís que te llamen por la mañana o por la
    // tarde?". El notify_team se disparó bien (interes_compra), pero el
    // responseText repreguntó la franja que el lead acababa de dar.
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      { user: "me interesa un 2 ambientes" },
      { user: "dale, llamame" },
      {
        user: "preferiria por la tarde, a partir de las 17hs",
        expect: {
          notifies: "interes_compra",
          // El responseText debe ser un acuse afirmativo, NO una repregunta.
          custom: (out) => {
            const text = out.responseText.toLowerCase();
            // Si repregunta la franja → falla (esto es el bug que arreglamos).
            if (
              /pref[ei]r[ií]s.*(ma[ñn]ana|tarde)/i.test(text) ||
              /preferis.*(manana|tarde)/i.test(text)
            ) {
              return "repregunta la franja después de que el lead ya la dio (debería cerrar con acuse)";
            }
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Promo cash USD 85.000 monoambiente → deriva interes_compra, no fuera de rango",
    // El anuncio publicitario es "monoambiente desde USD 85.000 cash" pero
    // ese precio NO figura en la lista oficial. La KB tiene una nota
    // explícita: si el lead pide algo en ese rango cash, NO decirle "fuera
    // de rango" — tratarlo como interes_compra y pedir franja para derivar.
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "busco inversión en monoambiente, vi el anuncio de 85 mil cash",
        expect: {
          doesNotNotify: true,
          // No debe descartar el rango ni mandar la lista oficial.
          notContains: [
            "1VmFe0NrlHUuAgGpMmGdDcbnr90LlkGTS",
            "lista de precios",
            "por encima de tu rango",
            "fuera de tu rango",
            "fuera de rango",
            "parten desde los USD 90",
            "parten desde USD 90",
            "desde USD 95",
          ],
          // Debe ofrecer la llamada con un asesor.
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // "llam" cubre llama, llamen, llamada, llamamos, llamado;
            // asesor, contact, coordinamos.
            if (!/llam|asesor|contact|coordinamos/.test(lower))
              return "no ofrece llamada con asesor para la promo cash";
            return null;
          },
        },
      },
      {
        user: "por la mañana",
        expect: {
          notifies: "interes_compra",
        },
      },
    ],
  },

  {
    name: "Multi-pregunta (planos + precios + cochera) → tono cálido, no telegráfico",
    // Bug visto en prod (Federico, 2026-06-07): ante "Tenes planos y
    // precio de unidades 1 y 2 ambientes? Tienen cocheras?" Mica
    // respondió con TRES mensajes separados, secos, dato-tras-dato y
    // cerró con "Las unidades no incluyen cochera" a secas. Federico:
    // "lo siento un poco chocante y cero amigable, es una IA comercial".
    // Esperamos: respuesta con apertura cálida, en menos bloques (idealmente
    // 1-2), y si menciona cochera la suaviza (no la deja sola al final).
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "Tenes planos y precio de unidades 1 y 2 ambientes? Tienen cocheras?",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const text = out.responseText;
            const lower = text.toLowerCase();

            // 1) Apertura cálida: la primera línea no puede ser un dato
            // pelado tipo "Los planos los vas a ver...". Aceptamos cualquier
            // palabra cálida al inicio.
            const firstLine = text.split(/\n/)[0]!.trim().toLowerCase();
            const tieneAperturaCalida =
              /^(claro|bueni|buen[oí]si|s[ií]|por supuesto|dale|te cuento|mir[áa]|perfecto|genial|cierto)/.test(
                firstLine,
              );
            if (!tieneAperturaCalida)
              return `arranca seco ("${firstLine.slice(0, 60)}..."), falta apertura cálida`;

            // 2) Menos bloques: el anti-patrón fue 3 bloques separados con
            // ---. Para una multi-pregunta esto debería resolverse en 1 o 2
            // bloques. Más de 2 separadores = bloques sobre-fragmentados.
            const sep = (text.match(/\n---\n/g) ?? []).length;
            if (sep > 2)
              return `${sep + 1} bloques separados (muy telegráfico, debería ser 1-2)`;

            // 3) Cochera suavizada: si menciona cochera y la respuesta es
            // negativa, NO puede quedar SOLA como último bloque a secas.
            if (/cochera/.test(lower)) {
              const lastBlock = text.split(/\n---\n/).at(-1)!.trim();
              const ultraCorta = lastBlock.length < 50;
              const soloCochera = /^las unidades?\s+no\s+(incluyen|tienen|cuentan con)\s+cochera/i.test(
                lastBlock,
              );
              if (ultraCorta && soloCochera)
                return `cierra con "Las unidades no incluyen cochera" como bloque seco final`;
            }

            return null;
          },
        },
      },
    ],
  },

  {
    name: "'Quiero mas informacion!' como primer mensaje → apertura, NO deriva por em dash falso",
    // Bug visto en prod (2026-06-07, cliente Nicolas): el evaluator confundía
    // los `---` de los separadores entre bloques con `—` (em dash) y
    // rechazaba 3 veces seguidas, agotando iteraciones y derivando como
    // fuera_de_conocimiento. La apertura es correcta y debe pasar a la
    // primera. Distinción crítica: `---` (3 ASCII hyphens) ≠ `—` (U+2014).
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      {
        user: "Quiero mas informacion!",
        expect: {
          doesNotNotify: true,
          contains: ["Team Scaglia", "---", "drive.google.com"],
          custom: (out) => {
            // Apertura: 3 bloques separados por `---` (al menos 2 separadores).
            const sep = (out.responseText.match(/\n---\n/g) ?? []).length;
            if (sep < 2)
              return `apertura debería tener 3 bloques separados por '---' (encontré ${sep} separadores)`;
            // Sanity: no debe contener el char real `—` (U+2014).
            if (out.responseText.includes("—"))
              return "la respuesta contiene em dash real (—); el separador debe ser '---'";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Pide hablar con asesor: deriva con 'pide_asesor', no 'fuera_de_conocimiento'",
    // Bug visto en prod: "quiero hablar con un asesor" caía a
    // fuera_de_conocimiento (la IA no sabía qué responder) cuando en
    // realidad es una intención clara de pasar a un humano. Categoría
    // dedicada para que el email + cartel + lead lo reflejen.
    now: VIERNES_DENTRO_HORARIO,
    turns: [
      { user: "hola" },
      {
        user: "quiero hablar con un asesor",
        expect: {
          // En este turno todavía NO debe derivar: igual que en interes_compra
          // tiene que pedir la franja horaria primero.
          doesNotNotify: true,
          contains: ["por la mañana", "por la tarde"],
        },
      },
      {
        user: "tarde",
        expect: {
          notifies: "pide_asesor",
        },
      },
    ],
  },
];
