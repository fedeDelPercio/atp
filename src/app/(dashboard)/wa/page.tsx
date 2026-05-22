"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/ConversationList";
import { ConversationPanel, type CommentTarget } from "@/components/ConversationPanel";
import { CommentsPanel } from "@/components/CommentsPanel";
import { QRScreen } from "@/components/wa/QRScreen";
import { WaHeader } from "@/components/wa/WaHeader";

// Sección Producción: WhatsApp real conectado via Baileys.
//
// Si no hay conexión activa, muestra QRScreen para escanear.
// Cuando se conecta, muestra header + lista de convs + panel.

type WaStatus = "disconnected" | "qr" | "connecting" | "connected";
type DefaultMode = "AI" | "HUMAN";

interface StatusResponse {
  status: WaStatus;
  phone: string | null;
  qrPng: string | null;
  lastError: string | null;
  defaultMode: DefaultMode;
  updatedAt: string;
}

export default function WaPage() {
  const [phase, setPhase] = useState<"loading" | "qr" | "connected">("loading");
  const [phone, setPhone] = useState<string | null>(null);
  const [defaultMode, setDefaultMode] = useState<DefaultMode>("HUMAN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Estado inicial: poll una vez para saber si ya hay conexión activa.
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/wa/connection/status", { cache: "no-store" });
      const json = (await r.json()) as StatusResponse;
      setDefaultMode(json.defaultMode === "AI" ? "AI" : "HUMAN");
      if (json.status === "connected" && json.phone) {
        setPhone(json.phone);
        setPhase("connected");
      } else {
        setPhase("qr");
      }
    } catch {
      setPhase("qr");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-sm text-neutral-400">Cargando...</div>
      </div>
    );
  }

  if (phase === "qr" || !phone) {
    return (
      <QRScreen
        onConnected={(newPhone) => {
          setPhone(newPhone);
          setPhase("connected");
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <WaHeader
        phone={phone}
        defaultMode={defaultMode}
        onDefaultModeChange={setDefaultMode}
        onDisconnected={() => {
          setPhone(null);
          setPhase("qr");
          setSelectedId(null);
          setCommentTarget(null);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <ConversationList
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          selectedId={selectedId}
          sourceFilter="whatsapp"
          hideNewButton
          title="WhatsApp"
          emptyLabel="Sin conversaciones todavía. Esperá a que llegue el primer mensaje."
          onSelect={(id) => {
            setSelectedId(id);
            setCommentTarget(null);
            setSidebarOpen(false);
          }}
          onDeleted={(id) => {
            if (selectedId === id) {
              setSelectedId(null);
              setCommentTarget(null);
            }
          }}
        />

        {selectedId ? (
          <ConversationPanel
            key={selectedId}
            conversationId={selectedId}
            onOpenComments={setCommentTarget}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center dark:bg-neutral-950">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <MessageCircle className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                WhatsApp conectado
              </p>
              <p className="mt-0.5 text-sm text-neutral-400 dark:text-neutral-500">
                Cuando lleguen mensajes los vas a ver acá. Elegí una conversación de la lista.
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 md:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Menu className="h-4 w-4" /> Ver conversaciones
            </button>
          </div>
        )}

        {commentTarget && (
          <CommentsPanel target={commentTarget} onClose={() => setCommentTarget(null)} />
        )}
      </div>
    </div>
  );
}
