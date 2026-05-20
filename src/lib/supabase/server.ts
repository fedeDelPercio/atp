import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "./types";

// Cliente de Supabase para el servidor (API routes, worker de jobs, hooks
// del agente). Usa la SERVICE ROLE key: bypassa cualquier RLS y tiene acceso
// total. NUNCA debe importarse desde codigo de cliente.
//
// En fase 1 no hay auth ni cookies, por eso alcanza con el cliente plano de
// supabase-js. Cuando se active Supabase Auth (fase 2) se agrega aca el
// manejo de sesion via @supabase/ssr.
let serviceClient: SupabaseClient<Database> | null = null;

export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;
  serviceClient = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return serviceClient;
}
