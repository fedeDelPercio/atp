import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/comments
//
// Crea o actualiza un comentario firmado por perfil. Tres kinds:
// - kind="note": comentario "neutro" (incluye texto libre o vacío). Múltiples
//   permitidos por perfil sobre el mismo target.
// - kind="positive" | "negative": voto único por (target, autor), mutuamente
//   excluyentes. Si el autor ya tiene el opuesto, se borra el opuesto. Si ya
//   tiene el mismo kind, se ACTUALIZA su content con el nuevo. Si no tiene
//   nada, se inserta.
//
// El content es opcional para todos los kinds (puede ser vacío). El frontend
// hoy lo manda como null o string desde QuickCommentBubble.
// ===========================================================================

const createSchema = z.object({
  target_type: z.enum(["conversation", "message"]),
  target_id: z.string().uuid(),
  author_id: z.string().uuid(),
  kind: z.enum(["positive", "negative", "note"]).default("note"),
  content: z.string().max(4000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { target_type, target_id, author_id, kind, content } = parsed.data;
  const normalizedContent = content ?? "";
  const supabase = getSupabaseServerClient();

  // Votos (positive | negative): exclusividad + replace (no toggle).
  if (kind === "positive" || kind === "negative") {
    // 1) Borrar el voto opuesto del mismo autor (si existe).
    const opposite = kind === "positive" ? "negative" : "positive";
    await supabase
      .from("comments")
      .delete()
      .eq("target_id", target_id)
      .eq("author_id", author_id)
      .eq("kind", opposite);

    // 2) Si ya tiene el mismo voto, actualizar su content con el nuevo.
    const { data: existing } = await supabase
      .from("comments")
      .select("id")
      .eq("target_id", target_id)
      .eq("author_id", author_id)
      .eq("kind", kind)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("comments")
        .update({ content: normalizedContent })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ comment: data, updated: true }, { status: 200 });
    }

    // 3) Insertar voto nuevo.
    const { data, error } = await supabase
      .from("comments")
      .insert({ target_type, target_id, author_id, kind, content: normalizedContent })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data }, { status: 201 });
  }

  // Notas (neutro): insert directo, acumulativo.
  const { data, error } = await supabase
    .from("comments")
    .insert({ target_type, target_id, author_id, kind, content: normalizedContent })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
