import { z } from "zod";

// ===========================================================================
// Validacion de variables de entorno con zod.
//
// Se separan en dos grupos:
//  - clientEnv: variables NEXT_PUBLIC_*, disponibles en browser y server.
//    Se validan al importar este modulo (es seguro en cualquier contexto).
//  - serverEnv(): variables server-only (secrets). Se validan de forma
//    perezosa la primera vez que se las usa, para no romper el bundle del
//    cliente (donde estos valores no existen).
//
// Si falta algo critico, la validacion lanza un error claro y la app no
// arranca a medias ("fail loud").
// ===========================================================================

// --- Variables publicas ----------------------------------------------------
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL invalida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY es obligatoria"),
  // JWT firmado con el JWT secret del proyecto, con claim client_slug. Se
  // envia como Authorization: Bearer para que PostgREST lo lea via
  // auth.jwt() en las policies de RLS. NO reemplaza al anon key — ese sigue
  // siendo el "apikey" que el gateway de Supabase exige.
  NEXT_PUBLIC_SUPABASE_CLIENT_JWT: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_CLIENT_JWT es obligatoria"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL invalida")
    .default("http://localhost:3000"),
  // Slug del cliente activo. Lo usan algunos filtros del frontend (ej:
  // subscripciones Realtime). El aislamiento real de datos lo hace RLS via
  // el claim client_slug del CLIENT_JWT (ver migration 004).
  NEXT_PUBLIC_CLIENT_SLUG: z
    .string()
    .min(1, "NEXT_PUBLIC_CLIENT_SLUG es obligatoria (ej: 'ibath', 'quintaglia')")
    .regex(/^[a-z][a-z0-9_]*$/, "NEXT_PUBLIC_CLIENT_SLUG debe ser snake_case"),
});

function parseClientEnv() {
  // En Next.js las NEXT_PUBLIC_* se inyectan estaticamente: hay que
  // referenciarlas por nombre completo, no por indice dinamico.
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_CLIENT_JWT: process.env.NEXT_PUBLIC_SUPABASE_CLIENT_JWT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLIENT_SLUG: process.env.NEXT_PUBLIC_CLIENT_SLUG,
  });
  if (!parsed.success) {
    throw new Error(
      "Variables de entorno publicas invalidas o ausentes:\n" +
        parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  return parsed.data;
}

export const clientEnv = parseClientEnv();

// --- Variables server-only -------------------------------------------------
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY es obligatoria"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es obligatoria"),
  ANTHROPIC_MODEL_ORCHESTRATOR: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_SUBAGENT: z.string().default("claude-haiku-4-5"),
  ANTHROPIC_MODEL_EVALUATOR: z.string().default("claude-haiku-4-5"),
  // Cap del loop orquestador+evaluator. Default 3 (1 generación + 2
  // reintentos). El evaluator chequea grounding crítico + no_revela_ia;
  // si tras 3 iter sigue rechazando, run.ts distingue rechazo crítico
  // (deriva a humano) vs no crítico (envía la última respuesta al cliente
  // con log warning, sin notificar).
  AGENT_MAX_ITERATIONS: z.coerce.number().int().positive().default(3),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  CRON_SECRET: z.string().min(1, "CRON_SECRET es obligatoria"),
  WEBHOOK_SIGNING_SECRET: z
    .string()
    .min(1, "WEBHOOK_SIGNING_SECRET es obligatoria"),
  // Kommo CRM. Opcionales en build: si no están seteadas, las llamadas
  // a `getAccount()` u otros helpers tiran KommoConfigError en runtime.
  // Eso permite buildear / testear el panel sin tener la integración lista.
  KOMMO_SUBDOMAIN: z.string().optional(),
  KOMMO_LONG_LIVED_TOKEN: z.string().optional(),
  // Secret compartido con webhook configurado en Kommo. El webhook nativo
  // de Kommo no firma con HMAC, así que como defensa básica verificamos
  // este token en query string (`?secret=...`). El "secret" en la URL no
  // queda en logs accesibles a terceros mientras el endpoint sea privado.
  KOMMO_WEBHOOK_SECRET: z.string().optional(),
  // ID del Salesbot "Mensaje IA" que envía la respuesta al lead. Es un bot
  // mínimo de 1 step "Mensaje" con `{{contact.cf_1101964}}`. Lo lanzamos
  // programáticamente vía POST /api/v2/salesbot/run después de procesar
  // con el agente y setear el custom field con la respuesta.
  KOMMO_REPLY_BOT_ID: z.coerce.number().int().positive().default(64074),
  // ID de cuenta Kommo del cliente. Si está seteado, validamos que el
  // webhook entrante venga de esa cuenta (evita que otro Kommo apunte por
  // accidente a este endpoint).
  KOMMO_ACCOUNT_ID: z.coerce.number().int().positive().default(33057135),
  // Whitelist de contact_ids autorizados a disparar el agente. Coma-
  // separated. Cuando está seteada, el endpoint solo procesa mensajes que
  // vengan de esos contactos. Cuando está vacía o ausente, el endpoint
  // procesa cualquier mensaje (modo "prod abierto"). Durante el testing
  // ponemos los contact_ids del equipo aquí para no responderle a leads
  // reales accidentalmente.
  KOMMO_ALLOWED_CONTACT_IDS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Devuelve las variables server-only validadas. Lanza error si se invoca
 * en el browser o si falta alguna variable critica.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() no puede usarse en el cliente.");
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL_ORCHESTRATOR: process.env.ANTHROPIC_MODEL_ORCHESTRATOR,
    ANTHROPIC_MODEL_SUBAGENT: process.env.ANTHROPIC_MODEL_SUBAGENT,
    ANTHROPIC_MODEL_EVALUATOR: process.env.ANTHROPIC_MODEL_EVALUATOR,
    AGENT_MAX_ITERATIONS: process.env.AGENT_MAX_ITERATIONS,
    AGENT_TIMEOUT_MS: process.env.AGENT_TIMEOUT_MS,
    CRON_SECRET: process.env.CRON_SECRET,
    WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET,
    KOMMO_SUBDOMAIN: process.env.KOMMO_SUBDOMAIN,
    KOMMO_LONG_LIVED_TOKEN: process.env.KOMMO_LONG_LIVED_TOKEN,
    KOMMO_WEBHOOK_SECRET: process.env.KOMMO_WEBHOOK_SECRET,
    KOMMO_REPLY_BOT_ID: process.env.KOMMO_REPLY_BOT_ID,
    KOMMO_ACCOUNT_ID: process.env.KOMMO_ACCOUNT_ID,
    KOMMO_ALLOWED_CONTACT_IDS: process.env.KOMMO_ALLOWED_CONTACT_IDS,
  });
  if (!parsed.success) {
    throw new Error(
      "Variables de entorno del servidor invalidas o ausentes:\n" +
        parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n") +
        "\nRevisar .env.local (ver .env.example).",
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
