import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/dashboard/stats
//
// Devuelve las metricas agregadas del tab Dashboard: totales, distribuciones
// por temperatura / smart_tag / status / categoria de derivacion, y la
// timeline de leads por dia (ultimos 30 dias).
//
// Todo se calcula sobre la tabla `leads`, filtrada por el client_slug
// activo via RLS (misma logica que /api/leads). La consulta es una sola:
// traemos todos los leads del cliente y agregamos en JS para no depender
// de RPCs adicionales.
// ===========================================================================

interface Lead {
  id: string;
  status: string | null;
  smart_tag: string | null;
  temperatura: string | null;
  interest_category: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, status, smart_tag, temperatura, interest_category, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? []) as Lead[];

  return NextResponse.json(computeStats(leads));
}

function computeStats(leads: Lead[]) {
  const total = leads.length;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * dayMs;
  const thirtyDaysAgo = now - 30 * dayMs;

  const newLast7d = leads.filter(
    (l) => new Date(l.created_at).getTime() >= sevenDaysAgo,
  ).length;

  const byTemperatura = groupBy(leads, (l) => l.temperatura);
  const bySmartTag = groupBy(leads, (l) => l.smart_tag);
  const byStatus = groupBy(leads, (l) => l.status);
  const byCategory = groupBy(leads, (l) =>
    l.interest_category && l.interest_category !== "sin_categoria"
      ? l.interest_category
      : null,
  );

  const contacted = byStatus["contactado"] ?? 0;
  const hot = byTemperatura["caliente"] ?? 0;
  const contactedPct = total > 0 ? Math.round((contacted / total) * 100) : 0;

  // Timeline: buckets diarios de los ultimos 30 dias.
  const timeline: Array<{ date: string; count: number }> = [];
  const dayBuckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = isoDate(d);
    dayBuckets[key] = 0;
  }
  for (const l of leads) {
    const t = new Date(l.created_at).getTime();
    if (t < thirtyDaysAgo) continue;
    const key = isoDate(new Date(t));
    if (key in dayBuckets) dayBuckets[key] = (dayBuckets[key] ?? 0) + 1;
  }
  for (const [date, count] of Object.entries(dayBuckets)) {
    timeline.push({ date, count });
  }

  return {
    total,
    newLast7d,
    hot,
    contactedPct,
    byTemperatura,
    bySmartTag,
    byStatus,
    byCategory,
    timeline,
  };
}

function groupBy<T>(
  arr: T[],
  keyFn: (item: T) => string | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
