"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2, Menu } from "lucide-react";
import toast from "react-hot-toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CommentKind, Conversation, Message } from "@/lib/supabase/types";
import {
  getViewMode,
  setViewMode as persistViewMode,
  type ViewMode,
} from "@/lib/profile";
import { useProfile } from "./ProfileProvider";
import { Avatar } from "./Avatar";
import { ViewToggle } from "./ViewToggle";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import {
  EMPTY_REACTION,
  type MessageReactionState,
} from "./MessageReactions";

// Objetivo de un hilo de comentarios (una conversacion entera o un mensaje).
export type CommentTarget = {
  type: "conversation" | "message";
  id: string;
  label: string;
};

// Panel de conversacion: mensajes + composer. Escucha Realtime para ver
// aparecer la respuesta del agente y el indicador "Agente pensando…".

export function ConversationPanel({
  conversationId,
  onOpenComments,
  onOpenSidebar,
}: {
  conversationId: string;
  onOpenComments: (target: CommentTarget) => void;
  onOpenSidebar: () => void;
}) {
  const { profile } = useProfile();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReactionState>>(
    {},
  );
  const [viewMode, setViewMode] = useState<ViewMode>("simple");
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) setViewMode(getViewMode(profile.id));
  }, [profile]);

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    if (profile) persistViewMode(profile.id, mode);
  }

  const refreshThinking = useCallback(async () => {
    const { count } = await getSupabaseBrowserClient()
      .from("agent_jobs")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "processing"]);
    setThinking((count ?? 0) > 0);
  }, [conversationId]);

  // Recarga las reacciones (positive/negative/note) de todos los mensajes
  // de la conversacion en una sola query.
  const refreshReactions = useCallback(
    async (messageIds: string[]) => {
      if (messageIds.length === 0) {
        setReactions({});
        return;
      }
      const { data } = await getSupabaseBrowserClient()
        .from("comments")
        .select("target_id, author_id, kind")
        .eq("target_type", "message")
        .in("target_id", messageIds);

      const map: Record<string, MessageReactionState> = {};
      for (const id of messageIds) map[id] = { ...EMPTY_REACTION };
      for (const c of data ?? []) {
        const entry = map[c.target_id];
        if (!entry) continue;
        if (c.kind === "positive") {
          entry.positiveCount++;
          if (c.author_id === profile?.id) entry.myKind = "positive";
        } else if (c.kind === "negative") {
          entry.negativeCount++;
          if (c.author_id === profile?.id) entry.myKind = "negative";
        } else if (c.kind === "note") {
          entry.noteCount++;
        }
      }
      setReactions(map);
    },
    [profile?.id],
  );

  // Click en un boton de reaccion: positive/negative van al API (toggle),
  // note abre el panel lateral para escribir texto.
  const handleReact = useCallback(
    async (messageId: string, kind: CommentKind) => {
      if (!profile) {
        toast.error("Necesitás un perfil para comentar.");
        return;
      }
      if (kind === "note") {
        onOpenComments({ type: "message", id: messageId, label: "mensaje" });
        return;
      }
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_type: "message",
          target_id: messageId,
          author_id: profile.id,
          kind,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo registrar la reacción");
      }
      // El refetch viene por Realtime; si fallara, igual cae en el proximo
      // mount o cambio de conversacion.
    },
    [profile, onOpenComments],
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    setLoading(true);

    void (async () => {
      const [convRes, msgRes] = await Promise.all([
        supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      const msgs = msgRes.data ?? [];
      setConversation(convRes.data);
      setMessages(msgs);
      setLoading(false);
      void refreshThinking();
      void refreshReactions(msgs.map((m) => m.id));
    })();

    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const next = [...prev, incoming];
            void refreshReactions(next.map((m) => m.id));
            return next;
          });
          void refreshThinking();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_jobs",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void refreshThinking(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        () => {
          // Refetch barato (consulta filtrada por target_id IN). El RLS por
          // client_slug limita el ruido a comments del cliente activo.
          setMessages((prev) => {
            void refreshReactions(prev.map((m) => m.id));
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, refreshThinking, refreshReactions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2.5 sm:px-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={onOpenSidebar}
            className="-ml-1 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Ver conversaciones"
          >
            <Menu className="h-5 w-5" />
          </button>
          {conversation && <Avatar name={conversation.display_name} size="sm" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {conversation?.display_name ?? "…"}
            </p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              Conversación de prueba
            </p>
          </div>
          <button
            onClick={() =>
              onOpenComments({
                type: "conversation",
                id: conversationId,
                label: conversation?.display_name ?? "conversación",
              })
            }
            className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Comentarios de la conversación"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
        <ViewToggle mode={viewMode} onChange={changeView} />
      </div>

      {/* Mensajes */}
      <div className="scroll-thin flex-1 space-y-2.5 overflow-y-auto px-3 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
            Sin mensajes. Escribí el primero desde abajo.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              viewMode={viewMode}
              reactions={reactions[m.id]}
              onReact={handleReact}
            />
          ))
        )}
        {thinking && (
          <div className="flex items-center gap-2 px-1 text-xs text-neutral-400 dark:text-neutral-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
            </span>
            El agente está escribiendo…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
