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
    name: "Objeción uso+instalación sobre Ceibo: rebate sin meter presión proactiva",
    // Bug visto en prod (Julian, 2026-06-08): ante "Buenas! Me gusta el
    // Ceibo, es dificil de usar instalar no?" el agente metió "El Ceibo
    // además tiene una ventaja: funciona en cualquier presión de agua".
    // Violación de la regla "presión es REACTIVO": el cliente no preguntó
    // por presión. El evaluator rechazó eso (correcto), pero después entró
    // en loop adversarial rechazando las iteraciones siguientes por
    // motivos espurios → fuera_de_conocimiento → cliente sin respuesta.
    now: VIERNES_MANANA,
    turns: [
      {
        user: "Buenas! Me gusta el Ceibo, es dificil de usar instalar no?",
        expect: {
          doesNotNotify: true,
          // No debe mencionar presión / tanque / bomba (no lo pidió).
          notContains: [
            "presión",
            "tanque",
            "bomba",
            "funciona con cualquier presi",
            "no requiere presi",
          ],
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Debe rebatir la objeción de uso o instalación con info concreta.
            const tieneRebatirInstalacion =
              /(electric|tomacorriente|220|desplazador|plomero|pieza|sencilla|simple)/i.test(
                lower,
              );
            const tieneRebatirUso = /(control|remoto|intuitivo|botoner|simple)/i.test(lower);
            if (!tieneRebatirInstalacion && !tieneRebatirUso)
              return "no rebate ni la objeción de uso ni la de instalación con info concreta";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Contacto registrado en Kommo + info simple → responde con KB, NO deriva",
    // Bug visto en feedback (Manuel, msg 13610493, 2026-05-29): lead
    // registrado en Kommo preguntó "hace cuanto venden el ombu?" y la IA
    // derivó como cliente_existente con responseText vacío. Manuel:
    // "deberíamos nutrir esa info? se supone que la tienen". La info SÍ
    // está en la KB (Ombú: 2018). Federico decidió: si es pregunta simple
    // de KB → responder; si es técnica → atajo de servicio técnico.
    now: VIERNES_MANANA,
    isExistingCustomer: true,
    turns: [
      {
        user: "hace cuanto venden el ombu?",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            if (!/2018/.test(out.responseText))
              return "no menciona 2018 (el dato está en la KB)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Contacto registrado en Kommo + problema técnico → atajo de servicio técnico",
    // Complemento del caso anterior: si la consulta es técnica (algo roto),
    // SÍ debe derivar con el número de servicio técnico.
    now: VIERNES_MANANA,
    isExistingCustomer: true,
    turns: [
      {
        user: "no me anda el bidet, pierde presión",
        expect: {
          notifies: "cliente_existente",
          contains: ["2763-0700"],
        },
      },
    ],
  },

  {
    name: "Repregunta comercial (no técnica): no abrir menú de dudas",
    // Bug visto en feedback (Federico): después de describir Ombú vs Ceibo
    // el agente cerraba con "Qué te interesa más saber, las funciones de
    // cada modelo o los requisitos de instalación?". Eso abre menú de
    // exploración técnica en vez de empujar a la compra. La repregunta
    // tiene que medir intención: "ya los conocías?", "cuál te interesa
    // más?", "te imaginás reemplazando el tuyo?", etc.
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info de los inodoros inteligentes" },
      {
        user: "para mi departamento, estoy refaccionando",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Anti-patrón concreto del feedback de Federico.
            if (
              /qu[eé] te interesa m[áa]s saber/i.test(out.responseText) ||
              /funciones de cada modelo o los requisitos/i.test(out.responseText) ||
              /funciones de los modelos o los requisitos/i.test(out.responseText)
            ) {
              return "usa repregunta técnica (menú de dudas), debería ser comercial";
            }
            // Otras formas de "abrir menú" en vez de empujar.
            if (
              /qu[eé] otro detalle te puedo aclarar/i.test(out.responseText) ||
              /hay algo m[áa]s que quieras saber/i.test(out.responseText) ||
              /qu[eé] m[áa]s quer[ée]s saber/i.test(out.responseText) ||
              /te interesa seguir viendo opciones/i.test(out.responseText)
            ) {
              return "abre menú de dudas en vez de empujar a la compra";
            }
            // Heurística positiva: debería tener una marca comercial.
            // Aceptamos: oferta de llamada (santino/asesor) o repregunta
            // de preferencia ("cuál", "ya los conoc", "te imaginas",
            // "tenías visto").
            const tieneCierreComercial =
              /santino|asesor|nuestro asesor/i.test(lower) ||
              /(cu[áa]l.*(interesa|preferis|te llama)|cu[áa]l te.*atrap|ya los conoc|ya hab[íi]as visto|ten[íi]as visto|te imagin)/i.test(
                lower,
              );
            if (!tieneCierreComercial)
              return "no cierra con avance comercial (oferta de llamada o repregunta de preferencia)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Primera persona del plural: 'tenemos showroom', NO 'tienen'",
    // Bug visto en feedback (Manuel, 2026-05-29): "Tienen showroom en
    // Arenales 605...". Tiene que ser "Tenemos" porque el agente es parte
    // del equipo iBath.
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info" },
      { user: "para mi casa" },
      {
        user: "donde puedo ir a verlo?",
        expect: {
          custom: (out) => {
            const t = out.responseText.toLowerCase();
            if (/\btienen\s+showroom/.test(t))
              return "habla en tercera persona ('Tienen showroom') en vez de primera ('Tenemos')";
            if (!/showroom/.test(t)) return null;
            if (!/(tenemos|nuestro)/.test(t))
              return "menciona el showroom pero sin marca de primera persona ('tenemos' / 'nuestro')";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Off-topic primera vez: NO deriva, redirige al producto",
    // Bug visto en feedback (Manuel): lead pregunta "cuanto esta el dolar?"
    // y la IA deriva con fuera_de_conocimiento a la primera. Regla nueva:
    // primera vez off-topic → responder + redirigir SIN notify_team.
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info" },
      { user: "para mi casa" },
      {
        user: "cuanto esta el dolar?",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Debe redirigir al producto.
            if (!/(producto|modelo|inodoro|ibath|ombu|ceibo|dudas|ayudarte|smart toilet)/i.test(lower))
              return "no redirige al producto (debería ofrecer ayuda con iBath)";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Objeción 'instalación difícil' → rebate con info, no manda solo el catálogo",
    // Bug visto en feedback (Manuel): lead "muy lindo, dificil instalacion"
    // → IA respondió solo "Te comparto el catálogo: ...". Manuel pidió
    // rebatir con info concreta de electricidad + desplazador + manual.
    now: VIERNES_MANANA,
    turns: [
      {
        user: "muy lindo, pero dificil instalacion",
        expect: {
          doesNotNotify: true,
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            // Debe rebatir con info concreta de la KB.
            const tieneInfoConcreta =
              /(electric|tomacorriente|220|desplazador|plomero|pieza|sencilla|simple)/i.test(
                lower,
              );
            if (!tieneInfoConcreta)
              return "no rebate la objeción con info concreta (electricidad / desplazador / plomero)";
            // No debe ser solo el catálogo como respuesta.
            const esSoloCatalogo =
              /^[^.\n]{0,80}cat[aá]logo[^.\n]{0,200}drive.google/i.test(lower) &&
              lower.length < 250;
            if (esSoloCatalogo)
              return "responde solo con el catálogo en vez de rebatir la objeción";
            return null;
          },
        },
      },
    ],
  },

  {
    name: "Descuento Ombú: usa 'vigente' y NUNCA 'según cada caso'",
    // Bug visto en feedback (Guille, anotado por Manuel): la IA decía
    // "El descuento exacto lo maneja nuestro asesor según cada caso, pero
    // está vigente ahora en el Ombú". A Guille no le gustó "según cada
    // caso" — debería decir "el descuento vigente a la fecha".
    //
    // Chequeamos dos turnos:
    // - Primer turno: cuando aparece el descuento por primera vez, debe
    //   usar "vigente" o "activo".
    // - Segundo turno (repregunta): el wording oficial ya está implícito;
    //   sólo nos importa que NO use "según cada caso" / similares.
    now: VIERNES_MANANA,
    turns: [
      { user: "hola, quiero info" },
      { user: "para mi casa" },
      {
        user: "cuanto sale el ombu?",
        expect: {
          custom: (out) => {
            const lower = out.responseText.toLowerCase();
            if (!/descuento/.test(lower)) return null; // si no menciona, ok
            if (!/(vigente|activ)/.test(lower))
              return "menciona descuento sin 'vigente' / 'activo' (wording oficial pedido por el equipo)";
            if (/(seg[uú]n cada caso|seg[uú]n el caso|depende del caso|vemos si aplica)/i.test(out.responseText)) {
              return "usa wording bloqueado ('según cada caso' / similar)";
            }
            return null;
          },
        },
      },
      {
        user: "el descuento de que se trata?",
        expect: {
          notContains: [
            "según cada caso",
            "segun cada caso",
            "según el caso",
            "segun el caso",
            "depende del caso",
            "vemos si aplica",
          ],
        },
      },
    ],
  },

  {
    name: "Pregunta abierta + notify_team en el mismo turno: NO compatible",
    // Bug visto en feedback (Manuel): la IA respondió "Todos los modelos
    // tienen 3 años de garantía... Ya viste los modelos Ombú y Ceibo del
    // catálogo? Cuál de los dos te interesa más?" y AL MISMO TIEMPO derivó
    // (notify_team) sin esperar la respuesta. Regla nueva: si tu
    // responseText termina en pregunta abierta al cliente, no derivés.
    now: VIERNES_MANANA,
    turns: [
      { user: "quiero comprar" },
      { user: "mi casa" },
      { user: "no, por ahora no" }, // rechaza la llamada
      {
        user: "que pasa si se me rompe?",
        expect: {
          custom: (out) => {
            // Si derivó Y termina en pregunta abierta → falla.
            const text = out.responseText.trimEnd();
            const endsWithQuestion = text.endsWith("?");
            if (out.notified && endsWithQuestion) {
              return "derivó al equipo en un turno donde la respuesta termina con pregunta abierta (debería esperar la respuesta del lead)";
            }
            return null;
          },
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
