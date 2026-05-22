"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { ConversationMode } from "@/lib/supabase/types";

// Composer del modo HUMAN: input + boton enviar. Encola el mensaje en
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
      <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        Mica responde automáticamente. Cambiá a modo Humano para escribir vos.
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Escribí como humano del equipo..."
          className="flex-1 resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white transition hover:bg-amber-600 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
