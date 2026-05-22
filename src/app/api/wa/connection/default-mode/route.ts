import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { clientEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/wa/connection/default-mode
//
// Body: { mode: 'AI' | 'HUMAN' }
// Cambia el modo por defecto que se aplica a NUEVAS conversaciones de
// WhatsApp. No afecta conversaciones existentes (cada una tiene su `mode`
// propio que el operador puede togglear desde el panel).
// ===========================================================================

const bodySchema = z.object({
  mode: z.enum(["AI", "HUMAN"]),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const slug = clientEnv.NEXT_PUBLIC_CLIENT_SLUG;

  const { error } = await supabase
    .from("wa_connection_state")
    .update({ default_mode: parsed.data.mode, updated_at: new Date().toISOString() })
    .eq("client_slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: parsed.data.mode });
}
