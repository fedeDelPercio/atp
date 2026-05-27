import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/leads
//
// Lista los leads del cliente actual (filtrados por RLS via X-Client-Slug).
// Soporta filtros opcionales por status y interest_category.
// Ordenados por created_at DESC (mas nuevos primero).
// ===========================================================================
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const conversationId = searchParams.get("conversation_id");

  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("interest_category", category);
  if (conversationId) query = query.eq("conversation_id", conversationId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}
