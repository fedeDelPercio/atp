"use client";

import { useEffect, useState } from "react";
import { Loader2, QrCode, AlertCircle } from "lucide-react";

// Pantalla de conexión inicial: muestra el QR para escanear con WhatsApp.
// Polea /api/wa/connection/status cada 2s. Cuando el status pasa a
// 'connected', el parent (page) cambia a renderizar la sección principal.

type WaStatus = "disconnected" | "qr" | "connecting" | "connected";

interface StatusResponse {
  status: WaStatus;
  phone: string | null;
  qrPng: string | null;
  lastError: string | null;
  updatedAt: string;
}

export function QRScreen({
  onConnected,
}: {
  onConnected: (phone: string) => void;
}) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [waitingSince, setWaitingSince] = useState<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch("/api/wa/connection/status", { cache: "no-store" });
        const json = (await r.json()) as StatusResponse;
        if (cancelled) return;
        setData(json);
        if (json.status === "connected" && json.phone) {
          onConnected(json.phone);
        }
      } catch (err) {
        console.error("[QRScreen] poll error:", err);
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onConnected]);

  useEffect(() => {
    if (data?.status === "qr") {
      setWaitingSince(Date.now());
    }
  }, [data?.status]);

  const status = data?.status ?? "disconnected";
  const qrPng = data?.qrPng;
  const stalledMs = Date.now() - waitingSince;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-neutral-50 px-6 py-12 dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-500/10">
          <QrCode className="h-6 w-6 text-violet-600 dark:text-violet-400" />
        </div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Conectar WhatsApp
        </h1>
        <p className="max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          Escaneá el QR desde la app de WhatsApp del número que vas a usar.
          Abrí Configuración → Dispositivos vinculados → Vincular dispositivo.
        </p>
      </div>

      <div className="flex h-[340px] w-[340px] items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {qrPng ? (
          <img src={qrPng} alt="QR de WhatsApp" className="h-full w-full" />
        ) : status === "connecting" ? (
          <div className="flex flex-col items-center gap-2 text-sm text-blue-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            Conectando...
          </div>
        ) : status === "connected" ? (
          <div className="text-sm text-emerald-500">¡Conectado!</div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            Esperando al bot...
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span
          className={`h-2 w-2 rounded-full ${
            status === "qr"
              ? "animate-pulse bg-amber-500"
              : status === "connecting"
                ? "bg-blue-500"
                : status === "connected"
                  ? "bg-emerald-500"
                  : "bg-neutral-400"
          }`}
        />
        <span>
          {status === "qr" && "Esperando escaneo..."}
          {status === "connecting" && "Estableciendo conexión..."}
          {status === "connected" && "Conexión establecida"}
          {status === "disconnected" && "Sin conexión activa"}
        </span>
      </div>

      {status === "disconnected" && stalledMs > 10000 && (
        <div className="flex max-w-md items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El bot no responde. Verificá que el proceso del bot esté
            corriendo (`npm run start:bot` en local, o el contenedor en
            Easypanel).
          </span>
        </div>
      )}

      {data?.lastError && (
        <div className="max-w-md text-center text-xs text-rose-500">
          Último error: {data.lastError}
        </div>
      )}
    </div>
  );
}
