import "server-only";

import { serverEnv } from "@/lib/env";

// ===========================================================================
// Cliente HTTP para Kommo CRM.
//
// Autenticación: Long-Lived Access Token (1 año), generado en Kommo desde
// Configuración → Integraciones → Integración privada. El token y el
// subdomain se leen via env vars (KOMMO_SUBDOMAIN + KOMMO_LONG_LIVED_TOKEN).
//
// Endpoints REST: https://<subdomain>.kommo.com/api/v4/... (los `_embedded`
// vienen con HAL). Documentación: https://developers.kommo.com/reference/.
//
// Este cliente cubre lo que necesita la integración del agente:
//   - findContactByPhone     → matchear teléfono entrante con contacto existente.
//   - createContact          → alta de contacto cuando no existe.
//   - createLead             → alta de lead asociado al contacto.
//   - addNoteToLead          → registrar derivación / notas del agente.
//   - listPipelines          → para que la config del panel elija pipeline+etapa.
//
// El envío/recepción de mensajes de WhatsApp NO va por esta API REST estándar:
// usa la Kommo Chats API (amojo.kommo.com), que requiere un canal registrado
// aparte. Eso se arma en un módulo separado cuando confirmemos cómo está la
// integración de WA del cliente.
// ===========================================================================

export class KommoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KommoConfigError";
  }
}

export class KommoApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
    this.name = "KommoApiError";
  }
}

interface KommoConfig {
  subdomain: string;
  token: string;
  baseUrl: string;
}

function getConfig(): KommoConfig {
  const env = serverEnv();
  const subdomain = env.KOMMO_SUBDOMAIN;
  const token = env.KOMMO_LONG_LIVED_TOKEN;
  if (!subdomain || !token) {
    throw new KommoConfigError(
      "Kommo no está configurado: faltan KOMMO_SUBDOMAIN y/o KOMMO_LONG_LIVED_TOKEN.",
    );
  }
  return {
    subdomain,
    token,
    baseUrl: `https://${subdomain}.kommo.com/api/v4`,
  };
}

async function request<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<T> {
  const cfg = getConfig();
  const url = new URL(cfg.baseUrl + path);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    throw new KommoApiError(
      `Kommo respondió ${res.status} para ${init?.method ?? "GET"} ${path}`,
      res.status,
      text.slice(0, 500),
    );
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ---------------------------------------------------------------------------
// Account / health
// ---------------------------------------------------------------------------

export interface KommoAccount {
  id: number;
  name: string;
  subdomain: string;
  country: string | null;
  currency: string;
}

/**
 * Llama a /account. Es el endpoint más barato para validar que el token
 * está vivo y que el subdomain es correcto. Lo usa el ping de salud.
 */
export async function getAccount(): Promise<KommoAccount> {
  return request<KommoAccount>("/account");
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface KommoContact {
  id: number;
  name: string;
  custom_fields_values:
    | { field_code?: string; field_name?: string; values: { value: string }[] }[]
    | null;
}

interface KommoListResponse<T> {
  _embedded?: { contacts?: T[]; leads?: T[]; pipelines?: T[] };
}

/**
 * Busca contactos por teléfono. Kommo soporta `query` libre en /contacts
 * que matchea contra nombre, teléfono y email. Devolvemos el primero
 * exacto cuyo campo PHONE matchea (normalizado a dígitos).
 */
export async function findContactByPhone(
  phone: string,
): Promise<KommoContact | null> {
  const digits = normalizePhone(phone);
  if (!digits) return null;

  const data = await request<KommoListResponse<KommoContact>>("/contacts", {
    query: { query: digits, limit: 10 },
  });
  const contacts = data._embedded?.contacts ?? [];
  for (const c of contacts) {
    const fields = c.custom_fields_values ?? [];
    for (const f of fields) {
      if (f.field_code !== "PHONE") continue;
      for (const v of f.values) {
        if (normalizePhone(v.value) === digits) return c;
      }
    }
  }
  return null;
}

function normalizePhone(input: string): string {
  return input.replace(/\D+/g, "");
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  name: string;
  pipelineId?: number;
  statusId?: number;
  contactId?: number;
  /** Texto que queda en el primer "tag/nota" del lead. Opcional. */
  notes?: string;
}

export interface KommoLead {
  id: number;
  name: string;
  status_id: number;
  pipeline_id: number;
}

export async function createLead(input: CreateLeadInput): Promise<KommoLead> {
  const body = [
    {
      name: input.name,
      pipeline_id: input.pipelineId,
      status_id: input.statusId,
      _embedded: input.contactId
        ? { contacts: [{ id: input.contactId }] }
        : undefined,
    },
  ];
  const res = await request<KommoListResponse<KommoLead>>("/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const created = res._embedded?.leads?.[0];
  if (!created) {
    throw new KommoApiError("Kommo no devolvió el lead creado", 0, JSON.stringify(res));
  }
  if (input.notes) {
    await addNoteToLead(created.id, input.notes).catch(() => {
      // Si la nota falla no rompemos el alta del lead.
    });
  }
  return created;
}

export async function addNoteToLead(leadId: number, text: string): Promise<void> {
  await request<unknown>(`/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify([
      {
        note_type: "common",
        params: { text },
      },
    ]),
  });
}

/**
 * Mueve un lead existente a una nueva etapa del pipeline. Si se pasa
 * `noteText`, además se agrega como nota común al lead (en una llamada
 * separada — Kommo no permite cambiar status y notear en el mismo PATCH).
 * La nota es best-effort: si falla, no rompe el cambio de etapa.
 */
export async function updateLeadStatus(args: {
  leadId: number;
  pipelineId: number;
  statusId: number;
  noteText?: string;
}): Promise<void> {
  await request<unknown>(`/leads/${args.leadId}`, {
    method: "PATCH",
    body: JSON.stringify({
      pipeline_id: args.pipelineId,
      status_id: args.statusId,
    }),
  });
  if (args.noteText) {
    await addNoteToLead(args.leadId, args.noteText).catch((err) => {
      console.error("[kommo] no se pudo agregar nota al lead:", err);
    });
  }
}

/**
 * Setea un custom field tipo "text" en un contacto. Lo usa el endpoint del
 * Salesbot: tras procesar el mensaje con el agente, guardamos la respuesta
 * en `respuesta_ia` (field_id 1101962) y después el Salesbot lee esa
 * variable y la envía al lead via WA Lite — ese rodeo es necesario porque
 * la integración privada no tiene scope `chats` para mandar mensajes via
 * Chats API directamente.
 */
export async function setContactTextField(args: {
  contactId: number;
  fieldId: number;
  value: string;
}): Promise<void> {
  await request<unknown>(`/contacts/${args.contactId}`, {
    method: "PATCH",
    body: JSON.stringify({
      custom_fields_values: [
        {
          field_id: args.fieldId,
          values: [{ value: args.value }],
        },
      ],
    }),
  });
}

/**
 * Devuelve la lista de etiquetas (tags) asociadas a un contacto. Se usa
 * para el switch IA/Humano: si el contacto tiene una etiqueta especial
 * (ej. "humano_atiende"), el endpoint deja de procesar mensajes y un
 * asesor toma manualmente la conversación.
 *
 * Kommo devuelve los tags en `_embedded.tags`. Si no hay tags, devolvemos
 * array vacío.
 */
export async function getContactTags(
  contactId: number,
): Promise<{ id: number; name: string }[]> {
  const data = await request<{
    _embedded?: { tags?: { id: number; name: string }[] };
  }>(`/contacts/${contactId}?with=tags`);
  return data._embedded?.tags ?? [];
}

/**
 * Lanza un Salesbot programáticamente en un lead específico. Esto es lo que
 * usamos para responder al lead: el bot referido es un Salesbot mínimo de
 * 1 step que envía `{{contact.cf_1101964}}` (la respuesta del agente que
 * acabamos de setear via `setContactTextField`). El endpoint /salesbot/run
 * vive en `/api/v2/` — NO en v4. Devuelve 202 cuando lo aceptó.
 *
 * Limitación importante: si ya hay otro bot corriendo en el mismo lead,
 * Kommo rechaza este launch. En la práctica nuestro bot dura segundos así
 * que no debería ser problema, pero hay que estar atento.
 */
export async function launchSalesbot(args: {
  botId: number;
  leadId: number;
}): Promise<void> {
  const cfg = getConfig();
  const url = `https://${cfg.subdomain}.kommo.com/api/v2/salesbot/run`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      { bot_id: args.botId, entity_id: args.leadId, entity_type: 2 },
    ]),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new KommoApiError(
      `Kommo /salesbot/run respondió ${res.status}`,
      res.status,
      text.slice(0, 500),
    );
  }
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export interface KommoPipeline {
  id: number;
  name: string;
  is_main: boolean;
  _embedded?: { statuses: { id: number; name: string; sort: number }[] };
}

export async function listPipelines(): Promise<KommoPipeline[]> {
  const data = await request<KommoListResponse<KommoPipeline>>("/leads/pipelines");
  return data._embedded?.pipelines ?? [];
}
