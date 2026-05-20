// ===========================================================================
// Contexto de horario para el agente IBATH.
//
// Horario comercial: Lunes a Viernes, 9 a 20 hs, hora de Argentina.
// Dentro del horario el agente se presenta como Santino Zamboni; fuera de el,
// como "asistente comercial de iBath". El orquestador recibe este contexto en
// cada corrida y ajusta su persona segun corresponda.
// ===========================================================================

const TZ = "America/Argentina/Buenos_Aires";
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 20; // exclusivo: 20:00 ya es fuera de horario

// Nombres tal cual los devuelve Intl con locale es-AR (con tildes).
const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

export interface TimeContext {
  /** Fecha y hora local formateada (para mostrar e inyectar al prompt). */
  localTime: string;
  /** Dia de la semana en minusculas y sin tilde (ej: "miercoles"). */
  dayName: string;
  /** true si estamos dentro del horario comercial. */
  isBusinessHours: boolean;
}

/** Calcula el contexto de horario en zona horaria de Argentina. */
export function getTimeContext(now: Date = new Date()): TimeContext {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday").toLowerCase();
  const hour = parseInt(get("hour"), 10);
  const minute = get("minute");

  const dayIdx = WEEKDAYS.indexOf(weekday);
  const isWeekday = dayIdx >= 1 && dayIdx <= 5;
  const isBusinessHours =
    isWeekday && hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;

  return {
    localTime: `${get("day")}/${get("month")}/${get("year")} ${String(hour).padStart(2, "0")}:${minute}`,
    dayName: weekday,
    isBusinessHours,
  };
}

/** Bloque de texto con el contexto de horario para inyectar al prompt. */
export function timeContextBlock(tc: TimeContext): string {
  return [
    "=== Contexto de horario ===",
    `Ahora es ${tc.dayName} ${tc.localTime} (hora de Argentina).`,
    tc.isBusinessHours
      ? "Estás DENTRO del horario comercial (Lun a Vie, 9 a 20 hs)."
      : "Estás FUERA del horario comercial (Lun a Vie, 9 a 20 hs).",
  ].join("\n");
}
