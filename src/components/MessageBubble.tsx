"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Bell } from "lucide-react";
import type { Message, CommentKind } from "@/lib/supabase/types";
import type { ViewMode } from "@/lib/profile";
import { MessageTrace } from "./MessageTrace";
import {
  MessageReactions,
  EMPTY_REACTION,
  type MessageReactionState,
} from "./MessageReactions";
import { QuickCommentBubble } from "./QuickCommentBubble";

// Burbuja de un mensaje. En vista avanzada, los mensajes del agente con trace
// se pueden expandir para ver el detalle agentico.

// Regex de URLs http(s) razonablemente conservador: matchea hasta el primer
// caracter "raro" (espacio, parentesis, punto y aparte). Captura signos de
// puntuacion comunes al final solo si vienen pegados.
const URL_REGEX = /https?:\/\/[^\s<>()]+/g;

/**
 * Renderiza un texto convirtiendo URLs en <a> clickeables. Preserva el resto
 * del contenido tal cual (incluye saltos de linea via whitespace-pre-wrap del
 * contenedor). Para evitar links rotos por puntuacion final, recorta `.,;:!?)`
 * trailing del match.
 */
function renderWithLinks(content: string, isUser: boolean): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const linkClass = isUser
    ? "underline underline-offset-2 hover:text-white"
    : "text-violet-600 underline underline-offset-2 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300";

  for (const match of content.matchAll(URL_REGEX)) {
    const rawUrl = match[0];
    const trimmed = rawUrl.replace(/[.,;:!?)\]]+$/, "");
    const trailing = rawUrl.slice(trimmed.length);
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push(content.slice(lastIndex, start));
    }
    parts.push(
      <a
        key={`url-${key++}`}
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {trimmed}
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIndex = start + rawUrl.length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts.length > 0 ? parts : content;
}

export function MessageBubble({
  message,
  viewMode,
  reactions,
  onReact,
  onAddNote,
}: {
  message: Message;
  viewMode: ViewMode;
  reactions?: MessageReactionState;
  // Para positive/negative: toggle de reaccion. Para note: no hace nada en
  // el parent (la nota se envia via onAddNote desde la quick-bubble).
  onReact: (messageId: string, kind: CommentKind) => void;
  onAddNote: (messageId: string, content: string) => Promise<void>;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  // Cuando el usuario clickea una de las 3 reacciones, abrimos una burbuja
  // chica al costado para que pueda (opcionalmente) escribir el por que.
  const [quickKind, setQuickKind] = useState<CommentKind | null>(null);
  const state = reactions ?? EMPTY_REACTION;

  // Mensajes de sistema: el "cartel" de notificación al equipo.
  if (message.role === "system") {
    return (
      <div className="flex justify-center py-1">
        <div className="flex max-w-[92%] items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Bell className="h-3.5 w-3.5 shrink-0" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const isAgent = message.role === "assistant";
  const canExpand = viewMode === "advanced" && isAgent && Boolean(message.trace_id);

  function handleReactInline(kind: CommentKind) {
    // positive/negative: tambien hace toggle de la reaccion en el parent.
    if (kind === "positive" || kind === "negative") {
      onReact(message.id, kind);
    }
    // En todos los casos, abrimos la burbuja para nota opcional.
    setQuickKind(kind);
  }

  const reactionsCol = (
    <MessageReactions state={state} onReact={handleReactInline} />
  );

  // La quick-bubble se renderiza del lado del "borde libre" del mensaje:
  // para mensajes del user (alineados a la derecha), la burbuja va a la
  // IZQUIERDA de los iconos (mas lejos del bubble).
  // Para mensajes del agente (alineados a la izquierda), va a la DERECHA.
  const quickBubble = quickKind ? (
    <QuickCommentBubble
      kind={quickKind}
      side={isUser ? "left" : "right"}
      onSubmit={(content) => onAddNote(message.id, content)}
      onClose={() => setQuickKind(null)}
    />
  ) : null;

  return (
    <div
      id={`message-${message.id}`}
      className={`flex items-end gap-1 rounded-2xl px-1 py-0.5 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {isUser && quickBubble}
      {isUser && reactionsCol}
      <div className="max-w-[85%] sm:max-w-[78%]">
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isUser
              ? "rounded-br-md bg-violet-600 text-white"
              : "rounded-bl-md border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100"
          }`}
        >
          {renderWithLinks(message.content, isUser)}
        </div>

        <div
          className={`mt-1 flex items-center gap-2 px-1 text-[11px] text-neutral-400 dark:text-neutral-500 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span>
            {new Date(message.created_at).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>

          {canExpand && (
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="flex items-center gap-0.5 transition hover:text-violet-600 dark:hover:text-violet-400"
            >
              <ChevronRight
                className={`h-3 w-3 transition ${traceOpen ? "rotate-90" : ""}`}
              />
              trace
            </button>
          )}
        </div>

        {traceOpen && canExpand && message.trace_id && (
          <MessageTrace traceId={message.trace_id} />
        )}
      </div>
      {!isUser && reactionsCol}
      {!isUser && quickBubble}
    </div>
  );
}
