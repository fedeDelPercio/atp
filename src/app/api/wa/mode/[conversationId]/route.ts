import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/wa/mode/[conversationId]
//
// Cambia el modo de la conversación: 'AI' (Mica responde) o 'HUMAN' (Mica
// queda muda, un asesor responde desde el composer). El bot relee el mode
// en cada mensaje entrante, así que el cambio aplica al instante.
// ===========================================================================

const bodySchema = z.object({
  mode: z.enum(["AI", "HUMAN"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("conversations")
    .update({ mode: parsed.data.mode })
    .eq("id", conversationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: parsed.data.mode });
}
