import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/conversations/[id] — una conversacion por id.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ conversation: data });
}

const patchSchema = z.object({
  display_name: z.string().min(1).max(120),
});

// PATCH /api/conversations/[id] — renombra la conversacion. No tocamos
// updated_at para no patear la conversacion al tope de la lista; el orden
// queda determinado por la ultima actividad real (mensajes).
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
  const newName = parsed.data.display_name.trim();
  const { data, error } = await supabase
    .from("conversations")
    .update({ display_name: newName })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  // Sync display_name de la conversacion -> name del lead asociado (si existe).
  // El lead es opcional: cada conv tiene a lo sumo uno (UNIQUE conversation_id).
  await supabase.from("leads").update({ name: newName }).eq("conversation_id", id);

  return NextResponse.json({ conversation: data });
}

// DELETE /api/conversations/[id] — elimina la conversacion (cascada de
// mensajes, traces y jobs por las FK on delete cascade).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("conversations").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
