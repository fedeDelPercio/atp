"use client";

import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import type { ConversationMode } from "@/lib/supabase/types";

// Composer del modo HUMAN: textarea + botón enviar. Encola el mensaje en
// /api/wa/messages/[id] (que escribe en wa_outbox); el bot lo envía via
// Baileys en su próximo tick (~2s).
//
// En modo AI queda deshabilitado con un mensaje indicador.

export function HumanComposer({
  conversationId,
  mode,
}: {
  conversationId: string;
  mode: ConversationMode;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const disabled = mode === "AI";

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/wa/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`No se pudo enviar: ${err.error ?? r.statusText}`);
        return;
      }
      setText("");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (disabled) {
    return (
      <div className="border-t border-neutral-200 bg-white px-4 py-3 text-center text-[12px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
        Mica responde automáticamente. Cambiá a modo Humano para escribir vos.
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-200 bg-white px-4 py-4 sm:px-8 sm:py-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-end gap-2 rounded-md border border-amber-200/70 bg-white p-1.5 pl-3.5 transition focus-within:border-amber-400 dark:border-amber-500/30 dark:bg-neutral-900 dark:focus-within:border-amber-400/70">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Escribí como humano del equipo"
          className="scroll-thin max-h-32 min-h-[36px] flex-1 resize-none self-center bg-transparent py-2 text-[13.5px] outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500 text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Enviar como humano"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
