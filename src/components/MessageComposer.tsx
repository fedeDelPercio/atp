"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { ArrowUp, Loader2 } from "lucide-react";

// Composer del panel. Manda el mensaje al webhook entrante (igual que haria
// WhatsApp en fase 2). La respuesta del agente llega por Realtime.

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/webhooks/incoming", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, content, source: "panel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo enviar el mensaje");
        return;
      }
      setText("");
    } catch {
      toast.error("Error de red al enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-neutral-200 bg-white p-3 sm:px-6 sm:py-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-1.5 pl-3.5 transition focus-within:border-violet-400 focus-within:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus-within:border-violet-500 dark:focus-within:bg-neutral-800">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Escribí como si fueras el cliente…"
          className="scroll-thin max-h-32 min-h-[36px] flex-1 resize-none self-center bg-transparent py-2 text-sm outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
          aria-label="Enviar"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
