"use client";

import { useEffect, useRef, useState } from "react";
import { X, ArrowUp, Loader2 } from "lucide-react";
import type { CommentKind } from "@/lib/supabase/types";

// Burbuja inline que aparece al costado del bubble de un mensaje cuando el
// usuario clickea una reaccion o el icono de nota. Permite agregar
// (opcionalmente) un texto que se guarda como nota vinculada al mensaje.
// Si se cierra sin escribir, la reaccion previa (positive/negative) queda
// igual; la nota es opcional.

export function QuickCommentBubble({
  kind,
  side,
  onSubmit,
  onClose,
}: {
  kind: CommentKind;
  side: "left" | "right"; // donde se posiciona el caret respecto al bubble
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click afuera => cerrar (sin guardar; la reaccion ya quedo aparte).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    // Diferimos al siguiente tick para no capturar el click que abrio la burbuja.
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

  const label =
    kind === "positive"
      ? "¿Por qué positivo? (opcional)"
      : kind === "negative"
        ? "¿Por qué negativo? (opcional)"
        : "Agregá una nota";

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSubmit(content);
      setText("");
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      ref={ref}
      className={`relative w-60 shrink-0 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 ${
        side === "left" ? "mr-1" : "ml-1"
      }`}
      // Stop propagation no es estrictamente necesario porque el listener de
      // click-afuera ya excluye este nodo, pero ayuda con eventos sinteticos.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
          aria-label="Cerrar"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-end gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-900">
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
          placeholder="Escribí…"
          className="scroll-thin max-h-24 min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1 text-xs outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
          aria-label="Enviar nota"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
