"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { clientEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Conversation } from "@/lib/supabase/types";
import { Avatar } from "./Avatar";
import { NewConversationModal } from "./NewConversationModal";

// Lista de conversaciones de prueba.
// En desktop es una columna fija; en mobile es un drawer (open / onClose).

type Preview = { content: string; role: string };

export function ConversationList({
  selectedId,
  onSelect,
  open,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    const list = convs ?? [];
    setConversations(list);

    if (list.length > 0) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, content, role, created_at")
        .in(
          "conversation_id",
          list.map((c) => c.id),
        )
        .order("created_at", { ascending: false })
        .limit(200);
      const map: Record<string, Preview> = {};
      (msgs ?? []).forEach((m) => {
        if (!map[m.conversation_id]) {
          map[m.conversation_id] = { content: m.content, role: m.role };
        }
      });
      setPreviews(map);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("conversation-list")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_slug=eq.${clientEnv.NEXT_PUBLIC_CLIENT_SLUG}`,
        },
        () => void refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-neutral-900/40 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 shrink-0 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 md:static md:z-auto md:translate-x-0 dark:border-neutral-800 dark:bg-neutral-900 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header de la columna */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Conversaciones
            </h2>
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {conversations.length}
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            title="Nueva conversación de prueba"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Lista */}
        <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Todavía no hay conversaciones.
              <br />
              Creá la primera con el botón +.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => {
                const preview = previews[c.id];
                const selected = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelect(c.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                        selected
                          ? "bg-violet-50 dark:bg-violet-500/10"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                      }`}
                    >
                      <Avatar name={c.display_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {c.display_name}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                            {formatDistanceToNow(new Date(c.updated_at), {
                              addSuffix: false,
                              locale: es,
                            })}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {preview
                            ? `${preview.role === "user" ? "Cliente: " : preview.role === "assistant" ? "Agente: " : ""}${preview.content}`
                            : "Sin mensajes aún"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {modalOpen && (
          <NewConversationModal
            onClose={() => setModalOpen(false)}
            onCreated={(id) => {
              setModalOpen(false);
              void refetch();
              onSelect(id);
            }}
          />
        )}
      </div>
    </>
  );
}
