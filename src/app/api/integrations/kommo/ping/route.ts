import { NextResponse } from "next/server";

import { getAccount, listPipelines, KommoConfigError, KommoApiError } from "@/lib/kommo/client";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/integrations/kommo/ping
//
// Endpoint de salud para validar la integración con Kommo. Hace dos llamadas
// baratas: /account (confirma que token + subdomain son válidos) y
// /leads/pipelines (confirma que tenemos permiso de lectura). Devuelve los
// pipelines con sus etapas, así sabemos qué IDs configurar después para
// alta de leads.
//
// Solo para uso operativo (debugging / onboarding). NO devuelve secrets.
// ===========================================================================

export async function GET() {
  try {
    const [account, pipelines] = await Promise.all([getAccount(), listPipelines()]);
    return NextResponse.json({
      ok: true,
      account: {
        id: account.id,
        name: account.name,
        subdomain: account.subdomain,
      },
      pipelines: pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        is_main: p.is_main,
        statuses: p._embedded?.statuses?.map((s) => ({ id: s.id, name: s.name })) ?? [],
      })),
    });
  } catch (err) {
    if (err instanceof KommoConfigError) {
      return NextResponse.json(
        { ok: false, error: "config_missing", message: err.message },
        { status: 503 },
      );
    }
    if (err instanceof KommoApiError) {
      return NextResponse.json(
        { ok: false, error: "kommo_error", status: err.status, body: err.body },
        { status: 502 },
      );
    }
    const msg = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json({ ok: false, error: "unexpected", message: msg }, { status: 500 });
  }
}
