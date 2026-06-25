// ===========================================================================
// Mapeo entre categorías de derivación del agente y el pipeline de Kommo.
//
// Los IDs concretos los validé contra la cuenta real `infoibathcomar.kommo.com`
// con curl al endpoint /leads/pipelines (ver `getAccount`/`listPipelines`).
// Si el cliente reorganiza el pipeline o suma etapas nuevas, hay que
// actualizar esta tabla.
//
// Pipeline principal del cliente: "Etapas" (id 9003699).
// ===========================================================================

/** ID del pipeline principal del cliente (donde aterrizan todos los leads). */
export const KOMMO_PIPELINE_ID = 9003699;

/**
 * Mapeo categoría → status_id. Si el agente notifica una categoría que no
 * está acá, cae al default (Leads Entrantes) y queda para que el equipo
 * revise manualmente. Eso es a propósito: mejor caer al inbox del CRM que
 * crashear o saltarse la derivación.
 */
export const KOMMO_STATUS_BY_CATEGORY: Record<string, number> = {
  interes_compra: 103021771, // Minorista (interesado)
  arquitecto_desarrollador: 107948039, // Arquitecto/Desarrollador
  cantidad_equipos: 76558663, // Proyecto inmobiliario
  cliente_existente: 75289663, // SERVICIO TÉCNICO
  fuera_de_conocimiento: 70214403, // Leads Entrantes
  falla_tecnica: 70214403, // Leads Entrantes
  escalado_manual: 70214403, // Leads Entrantes
};

/** Default cuando la categoría no está mapeada: que un humano lo revise. */
export const KOMMO_DEFAULT_STATUS_ID = 70214403;

export function statusIdForCategory(category: string | null | undefined): number {
  if (!category) return KOMMO_DEFAULT_STATUS_ID;
  return KOMMO_STATUS_BY_CATEGORY[category] ?? KOMMO_DEFAULT_STATUS_ID;
}

/**
 * Custom fields del contacto donde guardamos la respuesta del agente
 * partida en hasta 3 burbujas. El Salesbot tiene 3 steps Mensaje en
 * serie: el primero envía cf_1101964 sin condición, el 2do y 3ro tienen
 * condicional "field no vacío" para no disparar burbujas fantasma.
 *
 * Cada turno seteamos los 3 fields (los segmentos faltantes con cadena
 * vacía) para limpiar restos del turno anterior.
 *
 * Tipo de los fields: textarea (>256 chars). El field corto (1101962)
 * está deprecado por límite de 256.
 */
export const KOMMO_CONTACT_FIELDS_RESPUESTA_IA = [1101964, 1101978, 1101980] as const;
