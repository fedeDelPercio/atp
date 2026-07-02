import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleRecurringFollowup } from "@/lib/followups/schedule";

export const dynamic = "force-dynamic";

// ===========================================================================
// PATCH /api/lead-followups/[id]
//
// Marca un follow-up como completado (con notas + quien lo hizo). Si el
// follow-up marcado era el ultimo pendiente y el lead sigue activo,
// automaticamente crea el siguiente segun la periodica configurada para
// su temperatura.
// ===========================================================================

const patchSchema = z.object({
  notes: z.string().max(4000).nullable().optional(),
  completed_by: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();

  // Chequear que no este ya completado (evitar doble-generar el proximo).
  const { data: existing } = await supabase
    .from("lead_followups")
    .select("id, lead_id, completed_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  }
  if (existing.completed_at) {
    return NextResponse.json({ error: "Ya estaba completado" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("lead_followups")
    .update({
      completed_at: new Date().toISOString(),
      notes: parsed.data.notes ?? null,
      completed_by: parsed.data.completed_by ?? null,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });

  // Genera el siguiente follow-up automaticamente (respeta enabled + status).
  await scheduleRecurringFollowup(existing.lead_id);

  return NextResponse.json({ followup: data });
}

// ===========================================================================
// DELETE /api/lead-followups/[id]
//
// Elimina un follow-up (por ejemplo si el vendedor lo creo por error).
// Solo permitido si esta pendiente. Los completados quedan como historial.
// ===========================================================================
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("lead_followups")
    .select("id, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  }
  if (existing.completed_at) {
    return NextResponse.json(
      { error: "No se puede borrar un seguimiento completado" },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("lead_followups")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
