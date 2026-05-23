// ===========================================================================
// Cliente Supabase singleton para el bot.
//
// Usa el JWT custom con claim client_slug (NEXT_PUBLIC_SUPABASE_CLIENT_JWT),
// igual que el server-side de Next. Eso hace que RLS filtre automáticamente
// por client_slug en todas las queries.
// ===========================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const clientJwt = process.env.NEXT_PUBLIC_SUPABASE_CLIENT_JWT;
  if (!url || !anonKey || !clientJwt) {
    throw new Error(
      "Faltan env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_CLIENT_JWT",
    );
  }
  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${clientJwt}` } },
  });
  return cached;
}

export function getClientSlug(): string {
  const slug = process.env.NEXT_PUBLIC_CLIENT_SLUG;
  if (!slug) throw new Error("Falta NEXT_PUBLIC_CLIENT_SLUG en env");
  return slug;
}
