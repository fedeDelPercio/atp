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
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-neutral-500 dark:text-neutral-400">Conectado:</span>
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
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
              defaultMode === "AI"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
            }`}
          >
            {defaultMode === "AI" ? (
              <Bot className="h-3.5 w-3.5" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            Nuevos chats: {defaultMode === "AI" ? "IA" : "Humano"}
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-neutral-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            Desconectar
          </button>
        </div>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !working && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Desconectar WhatsApp
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Vas a desconectar el número +{phone}. El bot va a cerrar sesión y
              vas a tener que escanear un QR nuevo para reconectar.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={working}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={working}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
