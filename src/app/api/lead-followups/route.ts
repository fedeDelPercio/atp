import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/lead-followups?lead_id=X
//
// Timeline de seguimientos de un lead: los completados abajo, el pendiente
// arriba (si lo hay). Orden por due_at desc.
// ===========================================================================

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  if (!leadId) {
    return NextResponse.json({ error: "lead_id requerido" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("lead_followups")
    .select(
      "id, lead_id, kind, due_at, completed_at, completed_by, notes, created_at",
    )
    .eq("lead_id", leadId)
    .order("due_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ followups: data ?? [] });
}
