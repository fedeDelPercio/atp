import { NextResponse } from "next/server";
import { z } from "zod";
import { clientEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/follow-up-rules
//
// Devuelve las 3 reglas de seguimiento del cliente activo (frio / tibio /
// caliente), listas para pintar el modulo `/seguimientos`. Si por alguna
// razon falta alguna, la completamos in-memory con defaults conservadores
// para que la UI siempre tenga las 3 cards.
// ===========================================================================

const TEMPERATURAS = ["caliente", "tibio", "frio"] as const;
type Temperatura = (typeof TEMPERATURAS)[number];

const DEFAULT_BY_TEMP: Record<
  Temperatura,
  { first_interval_days: number; recurring_interval_days: number; enabled: boolean }
> = {
  caliente: { first_interval_days: 2, recurring_interval_days: 5, enabled: true },
  tibio: { first_interval_days: 3, recurring_interval_days: 7, enabled: true },
  frio: { first_interval_days: 7, recurring_interval_days: 15, enabled: false },
};

interface Rule {
  temperatura: Temperatura;
  first_interval_days: number;
  recurring_interval_days: number;
  enabled: boolean;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("follow_up_rules")
    .select("temperatura, first_interval_days, recurring_interval_days, enabled")
    .eq("client_slug", clientEnv.NEXT_PUBLIC_CLIENT_SLUG);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byTemp = new Map<Temperatura, Rule>();
  for (const r of data ?? []) {
    if (
      r.temperatura === "caliente" ||
      r.temperatura === "tibio" ||
      r.temperatura === "frio"
    ) {
      byTemp.set(r.temperatura, r as Rule);
    }
  }
  const rules: Rule[] = TEMPERATURAS.map(
    (t) =>
      byTemp.get(t) ?? {
        temperatura: t,
        ...DEFAULT_BY_TEMP[t],
      },
  );

  return NextResponse.json({ rules });
}

// ===========================================================================
// PUT /api/follow-up-rules
//
// Upsert de las 3 reglas para el cliente activo. Recibe un array con las
// 3 temperaturas. Idempotente: usamos upsert on (client_slug, temperatura).
// ===========================================================================

const ruleSchema = z.object({
  temperatura: z.enum(["frio", "tibio", "caliente"]),
  first_interval_days: z.number().int().positive().max(365),
  recurring_interval_days: z.number().int().positive().max(365),
  enabled: z.boolean(),
});

const putSchema = z.object({
  rules: z.array(ruleSchema).length(3),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const clientSlug = clientEnv.NEXT_PUBLIC_CLIENT_SLUG;
  const nowIso = new Date().toISOString();

  const payload = parsed.data.rules.map((r) => ({
    client_slug: clientSlug,
    temperatura: r.temperatura,
    first_interval_days: r.first_interval_days,
    recurring_interval_days: r.recurring_interval_days,
    enabled: r.enabled,
    updated_at: nowIso,
  }));

  const { data, error } = await supabase
    .from("follow_up_rules")
    .upsert(payload, { onConflict: "client_slug,temperatura" })
    .select("temperatura, first_interval_days, recurring_interval_days, enabled");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}
