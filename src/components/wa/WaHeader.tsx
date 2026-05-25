"use client";

import { useState } from "react";
import { CheckCircle2, LogOut, Loader2, Bot, User } from "lucide-react";
import toast from "react-hot-toast";

// Header de la sección WhatsApp: muestra el número conectado, un toggle
// "IA por defecto" (AI/HUMAN para conversaciones nuevas) y el botón
// "Desconectar" con modal de confirmación.

type DefaultMode = "AI" | "HUMAN";

export function WaHeader({
  phone,
  defaultMode,
  onDefaultModeChange,
  onDisconnected,
}: {
  phone: string;
  defaultMode: DefaultMode;
  onDefaultModeChange: (mode: DefaultMode) => void;
  onDisconnected: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function handleToggleDefault() {
    const next: DefaultMode = defaultMode === "AI" ? "HUMAN" : "AI";
    setSwitching(true);
    // Optimista.
    onDefaultModeChange(next);
    const r = await fetch("/api/wa/connection/default-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    setSwitching(false);
    if (!r.ok) {
      toast.error("No se pudo cambiar el modo por defecto");
      onDefaultModeChange(defaultMode); // revert
    }
  }

  async function handleDisconnect() {
    setWorking(true);
    try {
      await fetch("/api/wa/connection/disconnect", { method: "POST" });
      onDisconnected();
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 backdrop-blur sm:px-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 text-[13px]">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} />
          <span className="text-neutral-500 dark:text-neutral-500">Conectado:</span>
          <span className="font-mono text-neutral-800 dark:text-neutral-200">
            +{phone}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleDefault}
            disabled={switching}
            title={
              defaultMode === "AI"
                ? "Chats nuevos arrancan con IA respondiendo"
                : "Chats nuevos arrancan sin respuesta automática"
            }
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition disabled:opacity-50 ${
              defaultMode === "AI"
                ? "border-emerald-200/70 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/[0.06] dark:text-emerald-300"
                : "border-amber-200/70 bg-amber-50/60 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/[0.06] dark:text-amber-300"
            }`}
          >
            {defaultMode === "AI" ? (
              <Bot className="h-3 w-3" strokeWidth={1.75} />
            ) : (
              <User className="h-3 w-3" strokeWidth={1.75} />
            )}
            Nuevos chats: {defaultMode === "AI" ? "IA" : "Humano"}
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-neutral-500 transition hover:text-rose-500 dark:text-neutral-400 dark:hover:text-rose-400"
          >
            <LogOut className="h-3 w-3" strokeWidth={1.75} />
            Desconectar
          </button>
        </div>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm"
          onClick={() => !working && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-medium tracking-tight-er text-neutral-900 dark:text-neutral-50">
              Desconectar WhatsApp
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Vas a desconectar el número <span className="font-mono">+{phone}</span>.
              El bot va a cerrar sesión y vas a tener que escanear un QR nuevo
              para reconectar.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={working}
                className="rounded-md px-3 py-1.5 text-[13px] text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={working}
                className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {working && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
