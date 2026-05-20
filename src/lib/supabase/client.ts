"use client";

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";
import type { Database } from "./types";

// Cliente de Supabase para el browser. Usa la anon key + header
// X-Client-Slug, que dispara las policies de RLS y aisla los datos por
// cliente automaticamente. Se usa para lecturas desde componentes y para
// suscripciones Realtime (las suscripciones tambien usan `filter:
// client_slug=eq.<slug>` como defensa adicional, porque Realtime no
// respeta RLS por sí solo a traves del header).
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          "X-Client-Slug": clientEnv.NEXT_PUBLIC_CLIENT_SLUG,
        },
      },
    },
  );
  return browserClient;
}
