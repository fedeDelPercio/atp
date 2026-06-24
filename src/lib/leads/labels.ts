import type { LeadSmartTag, LeadTemperatura } from "@/lib/supabase/types";

// ===========================================================================
// Etiquetas + colores de los smart_tag y temperatura (compartido entre lista
// y modal de detalle).
// ===========================================================================

export const SMART_TAG_LABEL: Record<LeadSmartTag, string> = {
  curioso: "Curioso",
  busca_a_estrenar: "Busca a estrenar",
  interes_otras_opciones: "Otras opciones",
  interesado: "Interesado",
};

// Pill: borde + texto neutro. El acento queda para temperatura.
export const SMART_TAG_PILL: Record<LeadSmartTag, string> =
  Object.fromEntries(
    (Object.keys(SMART_TAG_LABEL) as LeadSmartTag[]).map((k) => [
      k,
      "border-neutral-200 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300",
    ]),
  ) as Record<LeadSmartTag, string>;

export const TEMPERATURA_LABEL: Record<LeadTemperatura, string> = {
  frio: "Frío",
  tibio: "Tibio",
  caliente: "Caliente",
};

// Punto de color asociado a la temperatura. Solo color en dot + texto,
// nunca fondo de bloque (regla del design system). La paleta es semantica:
// celeste = frio, naranja = tibio, rojo = caliente — matchea la intuicion
// cultural del usuario.
export const TEMPERATURA_DOT: Record<LeadTemperatura, string> = {
  frio: "bg-sky-500",
  tibio: "bg-orange-500",
  caliente: "bg-red-600",
};

export const TEMPERATURA_TEXT: Record<LeadTemperatura, string> = {
  frio: "text-sky-600 dark:text-sky-400",
  tibio: "text-orange-600 dark:text-orange-500",
  caliente: "text-red-600 dark:text-red-500",
};

export const SMART_TAGS_ORDERED: LeadSmartTag[] = [
  "interesado",
  "curioso",
  "busca_a_estrenar",
  "interes_otras_opciones",
];

export const TEMPERATURAS_ORDERED: LeadTemperatura[] = [
  "caliente",
  "tibio",
  "frio",
];
