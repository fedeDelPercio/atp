import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { clientEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// ===========================================================================
// GET /api/wa/connection/status
//
// Devuelve el estado de la conexión WhatsApp para el cliente actual. El
// panel lo polea cada 2s. Cuando el bot tiene un QR para escanear, este
// endpoint lo devuelve como Data URL (PNG base64) listo para renderear.
//
// Defensivo: muestra el QR si `qr_string` existe aunque `status='connecting'`
// (race condition durante el handshake inicial del pairing).
// ===========================================================================

export async function GET() {
  const supabase = getSupabaseServerClient();
  const slug = clientEnv.NEXT_PUBLIC_CLIENT_SLUG;

  const { data, error } = await supabase
    .from("wa_connection_state")
    .select("status, qr_string, phone, last_error, default_mode, updated_at")
    .eq("client_slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({
      status: "disconnected",
      phone: null,
      qrPng: null,
      lastError: null,
      defaultMode: "HUMAN",
      updatedAt: new Date().toISOString(),
    });
  }

  let qrPng: string | null = null;
  const shouldShowQr =
    !!data.qr_string &&
    (data.status === "qr" || data.status === "connecting");
  if (shouldShowQr && data.qr_string) {
    try {
      qrPng = await QRCode.toDataURL(data.qr_string, { width: 320, margin: 2 });
    } catch (err) {
      console.error("[wa/status] error generando QR PNG:", err);
    }
  }

  return NextResponse.json({
    status: data.status,
    phone: data.phone,
    qrPng,
    lastError: data.last_error,
    defaultMode: data.default_mode === "AI" ? "AI" : "HUMAN",
    updatedAt: data.updated_at,
  });
}
