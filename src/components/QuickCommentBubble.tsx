"use client";

import { useEffect, useRef } from "react";
import { Check, Minus, X, PenLine } from "lucide-react";
import type { CommentKind } from "@/lib/supabase/types";

// Menú compacto vertical que aparece al costado de un mensaje del asistente.
// El usuario elige un sentimiento (positivo / neutro / negativo) con un click
// y la burbuja cierra. La acción "Comentar" abre el CommentsPanel lateral
// donde vive el textarea largo, así la burbuja queda visualmente liviana.

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
  activeText: string;
  hoverText: string;
}> = [
  {
    id: "positive",
    label: "Positivo",
    Icon: Check,
    activeText: "text-emerald-700 dark:text-emerald-300",
    hoverText: "hover:text-emerald-700 dark:hover:text-emerald-300",
  },
  {
    id: "neutral",
    label: "Neutro",
    Icon: Minus,
    activeText: "text-neutral-900 dark:text-neutral-50",
    hoverText: "hover:text-neutral-900 dark:hover:text-neutral-50",
  },
  {
    id: "negative",
    label: "Negativo",
    Icon: X,
    activeText: "text-rose-700 dark:text-rose-300",
    hoverText: "hover:text-rose-700 dark:hover:text-rose-300",
  },
];

export function QuickCommentBubble({
  side,
  currentSentiment,
  onSubmit,
  onOpenComments,
  onClose,
}: {
  side: "left" | "right"; // dónde se posiciona respecto al bubble del mensaje
  // Si el usuario ya tiene un voto previo, mostramos esa opción resaltada
  // como "estado actual". Solo aplica a positive/negative (note no tiene
  // estado único).
  currentSentiment?: Sentiment;
  onSubmit: (kind: CommentKind) => Promise<void>;
  onOpenComments: () => void;
  onClose: () => void;
}) {
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

  async function pickSentiment(s: Sentiment) {
    // Disparamos el voto y abrimos el panel de comentarios "en paralelo": el
    // user puede dejar texto si quiere, o ignorar. Si el voto falla, el panel
    // igual queda abierto (mostramos toast de error pero no bloqueamos el
    // comentario).
    void onSubmit(SENTIMENT_TO_KIND[s]);
    onOpenComments();
    onClose();
  }

  function openCommentsPanel() {
    // Atajo cuando el user solo quiere comentar sin votar.
    onOpenComments();
    onClose();
  }

  return (
    <div
      ref={ref}
      className={`relative w-40 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark ${
        side === "left" ? "mr-1" : "ml-1"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.Icon;
        const active = currentSentiment === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => void pickSentiment(opt.id)}
            className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[12px] transition ${
              active
                ? `${opt.activeText} bg-neutral-50 font-medium dark:bg-neutral-800/60`
                : `text-neutral-600 dark:text-neutral-400 ${opt.hoverText} hover:bg-neutral-50 dark:hover:bg-neutral-800/60`
            }`}
          >
            <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
            {opt.label}
          </button>
        );
      })}
      <div className="my-1 border-t border-neutral-100 dark:border-neutral-800/70" />
      <button
        onClick={openCommentsPanel}
        className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[12px] text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100"
      >
        <PenLine className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        Comentar
      </button>
    </div>
  );
}
