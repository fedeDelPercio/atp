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

// Punto de color asociado a la temperatura, en la paleta del design system
// (ok / warn / red, sin gradientes ni fondos rellenos).
export const TEMPERATURA_DOT: Record<LeadTemperatura, string> = {
  frio: "bg-neutral-400 dark:bg-neutral-500",
  tibio: "bg-warn",
  caliente: "bg-red-600",
};

export const TEMPERATURA_TEXT: Record<LeadTemperatura, string> = {
  frio: "text-neutral-500 dark:text-neutral-400",
  tibio: "text-warn",
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
