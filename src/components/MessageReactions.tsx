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

  // Paleta segun el tipo.
  const palette = {
    positive: {
      activeBg: "bg-emerald-100 dark:bg-emerald-500/15",
      activeText: "text-emerald-600 dark:text-emerald-400",
      hoverText: "hover:text-emerald-600 dark:hover:text-emerald-400",
    },
    negative: {
      activeBg: "bg-rose-100 dark:bg-rose-500/15",
      activeText: "text-rose-600 dark:text-rose-400",
      hoverText: "hover:text-rose-600 dark:hover:text-rose-400",
    },
    note: {
      activeBg: "bg-violet-100 dark:bg-violet-500/15",
      activeText: "text-violet-600 dark:text-violet-400",
      hoverText: "hover:text-violet-600 dark:hover:text-violet-400",
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
