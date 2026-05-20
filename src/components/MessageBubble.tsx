"use client";

import { useState } from "react";
import { MessageSquare, ChevronRight, Bell } from "lucide-react";
import type { Message } from "@/lib/supabase/types";
import type { ViewMode } from "@/lib/profile";
import { MessageTrace } from "./MessageTrace";

// Burbuja de un mensaje. En vista avanzada, los mensajes del agente con trace
// se pueden expandir para ver el detalle agentico.

export function MessageBubble({
  message,
  viewMode,
  onOpenComments,
}: {
  message: Message;
  viewMode: ViewMode;
  onOpenComments: (messageId: string) => void;
}) {
  const [traceOpen, setTraceOpen] = useState(false);

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

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="group max-w-[85%] sm:max-w-[78%]">
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isUser
              ? "rounded-br-md bg-violet-600 text-white"
              : "rounded-bl-md border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100"
          }`}
        >
          {message.content}
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

          <button
            onClick={() => onOpenComments(message.id)}
            className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 hover:text-neutral-700 dark:hover:text-neutral-300"
            title="Comentarios sobre este mensaje"
          >
            <MessageSquare className="h-3 w-3" />
          </button>

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
    </div>
  );
}
