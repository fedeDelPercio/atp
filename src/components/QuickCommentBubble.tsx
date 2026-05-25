"use client";

import { useEffect, useRef, useState } from "react";
import { X, ArrowUp, Loader2, Check, Minus } from "lucide-react";
import type { CommentKind } from "@/lib/supabase/types";

// Burbuja inline que aparece al costado de un mensaje del asistente. El
// usuario elige un sentimiento (positivo / neutro / negativo) y opcionalmente
// escribe un comentario. El sentimiento es obligatorio para enviar; el texto
// es opcional. Si se cierra sin elegir sentimiento, no se guarda nada.

// Sentimiento de UI. "neutro" se mapea al kind `note` de la DB para no migrar
// el schema. Para el equipo, "neutro" significa: ni positivo ni negativo,
// típicamente un comentario informativo.
type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENT_TO_KIND: Record<Sentiment, CommentKind> = {
  positive: "positive",
  neutral: "note",
  negative: "negative",
};

const OPTIONS: Array<{
  id: Sentiment;
  label: string;
  Icon: typeof Check;
  activeClass: string;
}> = [
  {
    id: "positive",
    label: "Positivo",
    Icon: Check,
    activeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  {
    id: "neutral",
    label: "Neutro",
    Icon: Minus,
    activeClass:
      "border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100",
  },
  {
    id: "negative",
    label: "Negativo",
    Icon: X,
    activeClass:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
];

export function QuickCommentBubble({
  side,
  initialSentiment,
  onSubmit,
  onClose,
}: {
  side: "left" | "right"; // dónde se posiciona respecto al bubble del mensaje
  initialSentiment?: Sentiment;
  onSubmit: (kind: CommentKind, content: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [sentiment, setSentiment] = useState<Sentiment | null>(
    initialSentiment ?? null,
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click afuera => cerrar.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    // Diferimos al siguiente tick para no capturar el click que abrió la burbuja.
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick);
    };
  }, [onClose]);

  // ESC cierra.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    if (!sentiment || sending) return;
    setSending(true);
    try {
      const content = text.trim();
      await onSubmit(SENTIMENT_TO_KIND[sentiment], content || null);
      setText("");
      onClose();
    } finally {
      setSending(false);
    }
  }

  const canSend = !!sentiment && !sending;

  return (
    <div
      ref={ref}
      className={`relative w-64 shrink-0 rounded-md border border-neutral-200 bg-white p-2.5 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark ${
        side === "left" ? "mr-1" : "ml-1"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-tight-er text-neutral-700 dark:text-neutral-300">
          Cómo calificás esta respuesta?
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
          aria-label="Cerrar"
        >
          <X className="h-3 w-3" strokeWidth={1.75} />
        </button>
      </div>

      {/* Selector de sentimiento */}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.Icon;
          const active = sentiment === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setSentiment(opt.id)}
              className={`flex items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[11px] transition ${
                active
                  ? `${opt.activeClass} font-medium`
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              <Icon className="h-3 w-3" strokeWidth={2} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Textarea + send */}
      <div className="mt-2 flex items-end gap-1.5 rounded-md border border-neutral-200 bg-white p-1 transition focus-within:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:focus-within:border-neutral-600">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Comentario opcional"
          className="scroll-thin max-h-24 min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12px] outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          onClick={send}
          disabled={!canSend}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
          aria-label="Enviar"
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
