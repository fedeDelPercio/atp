"use client";

import { Check, X, StickyNote } from "lucide-react";
import type { CommentKind } from "@/lib/supabase/types";

// Fila horizontal de 3 acciones que se renderiza al costado de cada
// MessageBubble del asistente. Las dos primeras (positive/negative) son
// toggle y mutuamente excluyentes. La tercera (note) abre el panel de
// comentarios para escribir una nota larga sobre el mensaje. Horizontal
// para que la altura total no exceda la de la burbuja.

export type MessageReactionState = {
  positiveCount: number;
  negativeCount: number;
  noteCount: number;
  myKind: "positive" | "negative" | null;
};

export const EMPTY_REACTION: MessageReactionState = {
  positiveCount: 0,
  negativeCount: 0,
  noteCount: 0,
  myKind: null,
};

export function MessageReactions({
  state,
  onReact,
}: {
  state: MessageReactionState;
  onReact: (kind: CommentKind) => void;
}) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-0.5 self-end pb-1 opacity-40 transition hover:opacity-100">
      <ReactionButton
        kind="positive"
        active={state.myKind === "positive"}
        count={state.positiveCount}
        onClick={() => onReact("positive")}
      />
      <ReactionButton
        kind="negative"
        active={state.myKind === "negative"}
        count={state.negativeCount}
        onClick={() => onReact("negative")}
      />
      <ReactionButton
        kind="note"
        active={false}
        count={state.noteCount}
        onClick={() => onReact("note")}
      />
    </div>
  );
}

function ReactionButton({
  kind,
  active,
  count,
  onClick,
}: {
  kind: CommentKind;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = kind === "positive" ? Check : kind === "negative" ? X : StickyNote;
  const title =
    kind === "positive"
      ? "Marcar como positivo"
      : kind === "negative"
        ? "Marcar como negativo"
        : "Escribir una nota";

  // Paleta sutil por tipo. Positive y negative conservan color semántico
  // (verde / rojo) pero con saturación baja. Note es neutral.
  const palette = {
    positive: {
      activeBg: "bg-emerald-50 dark:bg-emerald-500/10",
      activeText: "text-emerald-700 dark:text-emerald-300",
      hoverText: "hover:text-emerald-700 dark:hover:text-emerald-300",
    },
    negative: {
      activeBg: "bg-rose-50 dark:bg-rose-500/10",
      activeText: "text-rose-700 dark:text-rose-300",
      hoverText: "hover:text-rose-700 dark:hover:text-rose-300",
    },
    note: {
      activeBg: "bg-neutral-100 dark:bg-neutral-800",
      activeText: "text-neutral-700 dark:text-neutral-200",
      hoverText: "hover:text-neutral-700 dark:hover:text-neutral-200",
    },
  }[kind];

  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-5 items-center gap-0.5 rounded-md px-1 text-[10px] transition ${
        active
          ? `${palette.activeBg} ${palette.activeText}`
          : `text-neutral-400 ${palette.hoverText} dark:text-neutral-500`
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {count > 0 && <span className="leading-none">{count}</span>}
    </button>
  );
}
