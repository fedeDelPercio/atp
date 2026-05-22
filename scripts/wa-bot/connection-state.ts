// ===========================================================================
// Helpers para leer/escribir wa_connection_state en Supabase.
//
// La tabla tiene una row por client_slug. Funciona como "buzón" entre el bot
// (este proceso) y el panel (Vercel): el bot escribe el QR cuando llega, el
// panel lo polea y lo muestra; cuando se conecta, el bot setea status y phone
// y el panel transiciona la UI.
// ===========================================================================

import { getSupabaseClient, getClientSlug } from "./supabase-client";

export type WaStatus = "disconnected" | "qr" | "connecting" | "connected";

export interface WaState {
  status: WaStatus;
  qr_string: string | null;
  phone: string | null;
  last_error: string | null;
  updated_at: string;
}

export async function getWaState(): Promise<WaState | null> {
  const supabase = getSupabaseClient();
  const slug = getClientSlug();
  const { data, error } = await supabase
    .from("wa_connection_state")
    .select("status, qr_string, phone, last_error, updated_at")
    .eq("client_slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[bot] error leyendo wa_connection_state:", error.message);
    return null;
  }
  return data as WaState | null;
}

/**
 * Setea el estado. Sólo actualiza los campos que se pasan explícitamente.
 * Para BORRAR un campo (qr_string o phone) hay que pasar `null` explícito;
 * undefined preserva el valor anterior.
 */
export async function setWaState(patch: Partial<WaState>): Promise<void> {
  const supabase = getSupabaseClient();
  const slug = getClientSlug();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.qr_string !== undefined) update.qr_string = patch.qr_string;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.last_error !== undefined) update.last_error = patch.last_error;

  const { error } = await supabase
    .from("wa_connection_state")
    .update(update)
    .eq("client_slug", slug);
  if (error) {
    console.error("[bot] error escribiendo wa_connection_state:", error.message);
  }
}
