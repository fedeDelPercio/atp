import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// POST /api/comments
//
// Crea un comentario firmado por perfil. Tres tipos:
// - kind="note": comentario de texto libre (multiples permitidos por perfil).
// - kind="positive" | "negative": reaccion-toggle. Unica por (target, autor):
//   - Si el mismo autor ya tiene esa reaccion en el mismo target -> la borra.
//   - Si tiene la opuesta -> la borrar y crea la nueva (mutuamente excluyentes).
//   - Si no tiene nada -> la crea.
// ===========================================================================

const createSchema = z
  .object({
    target_type: z.enum(["conversation", "message"]),
    target_id: z.string().uuid(),
    author_id: z.string().uuid(),
    kind: z.enum(["positive", "negative", "note"]).default("note"),
    content: z.string().max(4000).optional(),
  })
  .refine(
    (data) => data.kind !== "note" || (data.content && data.content.trim().length > 0),
    { message: "Las notas requieren contenido", path: ["content"] },
  );

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
  const supabase = getSupabaseServerClient();

  // Reacciones (positive | negative): toggle + exclusividad.
  if (kind === "positive" || kind === "negative") {
    // 1) Borrar la reaccion opuesta del mismo autor (si existe).
    const opposite = kind === "positive" ? "negative" : "positive";
    await supabase
      .from("comments")
      .delete()
      .eq("target_id", target_id)
      .eq("author_id", author_id)
      .eq("kind", opposite);

    // 2) Si la misma reaccion ya esta -> toggle off.
    const { data: existing } = await supabase
      .from("comments")
      .select("id")
      .eq("target_id", target_id)
      .eq("author_id", author_id)
      .eq("kind", kind)
      .maybeSingle();

    if (existing) {
      const { error: delErr } = await supabase
        .from("comments")
        .delete()
        .eq("id", existing.id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      return NextResponse.json({ toggled: "off", kind }, { status: 200 });
    }

    // 3) Crear la nueva reaccion (content vacio).
    const { data, error } = await supabase
      .from("comments")
      .insert({ target_type, target_id, author_id, kind, content: "" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data, toggled: "on", kind }, { status: 201 });
  }

  // Notas: insert directo.
  const { data, error } = await supabase
    .from("comments")
    .insert({ target_type, target_id, author_id, kind, content: content ?? "" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
