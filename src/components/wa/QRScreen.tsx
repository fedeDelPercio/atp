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
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-white px-6 py-12 dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-3 text-center">
        <QrCode
          className="h-8 w-8 text-neutral-900 dark:text-neutral-50"
          strokeWidth={1.5}
        />
        <h1 className="text-[20px] font-medium tracking-tight-er text-neutral-900 dark:text-neutral-50">
          Conectar WhatsApp
        </h1>
        <p className="max-w-md text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-500">
          Escaneá el QR desde la app de WhatsApp del número que vas a usar.
          Abrí Configuración, Dispositivos vinculados, Vincular dispositivo.
        </p>
      </div>

      <div className="flex h-[340px] w-[340px] items-center justify-center rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {qrPng ? (
          <img src={qrPng} alt="QR de WhatsApp" className="h-full w-full" />
        ) : status === "connecting" ? (
          <div className="flex flex-col items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-500">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
            Conectando
          </div>
        ) : status === "connected" ? (
          <div className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
            Conectado
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-500">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
            Esperando al bot
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === "qr"
              ? "animate-pulse bg-amber-500"
              : status === "connecting"
                ? "bg-neutral-500"
                : status === "connected"
                  ? "bg-emerald-500"
                  : "bg-neutral-400"
          }`}
        />
        <span>
          {status === "qr" && "Esperando escaneo"}
          {status === "connecting" && "Estableciendo conexión"}
          {status === "connected" && "Conexión establecida"}
          {status === "disconnected" && "Sin conexión activa"}
        </span>
      </div>

      {status === "disconnected" && stalledMs > 10000 && (
        <div className="flex max-w-md items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/[0.04] dark:text-amber-300/90">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span>
            El bot no responde. Verificá que el proceso del bot esté
            corriendo (<span className="font-mono">npm run start:bot</span> en local,
            o el contenedor en Easypanel).
          </span>
        </div>
      )}

      {data?.lastError && (
        <div className="max-w-md text-center text-[11px] text-rose-500 dark:text-rose-400">
          Último error: {data.lastError}
        </div>
      )}
    </div>
  );
}
