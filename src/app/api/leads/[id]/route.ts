import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Update } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z
    .enum([
      "nuevo",
      "contactado",
      "no_atendio",
      "recontactar",
      "dar_seguimiento",
      "descartado",
      "cerrado",
    ])
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  name: z.string().min(1).max(120).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  unit_typology: z.string().max(120).nullable().optional(),
  call_notes: z.string().max(4000).nullable().optional(),
  contacted_by: z.string().uuid().nullable().optional(),
});

// ===========================================================================
// GET /api/leads/[id] — un lead por id.
// ===========================================================================
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  return NextResponse.json({ lead: data });
}

// ===========================================================================
// PATCH /api/leads/[id]
//
// Actualiza el lead. Si el cambio incluye `status: contactado` y todavia no
// hay `contacted_at`, lo seteamos automaticamente. Si pasa a `nuevo` se
// limpia (caso edicion manual / equivocado).
// ===========================================================================
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

  const update: Update<"leads"> = {
    ...parsed.data,
    last_contact_at: new Date().toISOString(),
  };

  if (parsed.data.status === "contactado") {
    const { data: existing } = await supabase
      .from("leads")
      .select("contacted_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing?.contacted_at) {
      update.contacted_at = new Date().toISOString();
    }
  } else if (parsed.data.status === "nuevo") {
    update.contacted_at = null;
  }

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  return NextResponse.json({ lead: data });
}
