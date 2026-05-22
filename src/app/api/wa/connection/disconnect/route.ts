import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { clientEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/wa/connection/disconnect
//
// Setea wa_connection_state.status='disconnected' y borra qr_string + phone.
// El bot detecta el cambio en su próximo tick del disconnect-watcher y hace
// fullDisconnect (logout + borra ./auth/). Después de eso, el bot vuelve a
// arrancar y queda esperando un QR nuevo.
// ===========================================================================

export async function POST() {
  const supabase = getSupabaseServerClient();
  const slug = clientEnv.NEXT_PUBLIC_CLIENT_SLUG;

  const { error } = await supabase
    .from("wa_connection_state")
    .update({
      status: "disconnected",
      qr_string: null,
      phone: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("client_slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
