import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "./types";

// ===========================================================================
// Cliente de Supabase para el servidor (API routes, worker de jobs, hooks
// del agente).
//
// Usa la ANON key + header X-Client-Slug. RLS de Postgres filtra los datos
// por client_slug en cada request, asi no hay forma de mezclar datos entre
// clientes ni por bug ni por accidente.
//
// El header llega al worker por el codigo (no por la request HTTP del
// cliente original), porque el worker es interno y siempre opera bajo el
// CLIENT_SLUG configurado en su env.
// ===========================================================================
let scopedClient: SupabaseClient<Database> | null = null;
let adminClient: SupabaseClient<Database> | null = null;

export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (scopedClient) return scopedClient;
  scopedClient = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          "X-Client-Slug": clientEnv.NEXT_PUBLIC_CLIENT_SLUG,
        },
      },
    },
  );
  return scopedClient;
}

/**
 * Cliente admin (service_role). Bypassa RLS — solo usar para tareas que
 * genuinamente necesitan ver/escribir a traves de clientes (migraciones,
 * scripts de mantenimiento). NO usar desde rutas API ni desde el worker
 * en flujos normales: para eso esta `getSupabaseServerClient()`.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;
  adminClient = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return adminClient;
}
