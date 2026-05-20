"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X, ArrowUp, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Comment } from "@/lib/supabase/types";
import { useProfile } from "./ProfileProvider";
import { Avatar } from "./Avatar";
import type { CommentTarget } from "./ConversationPanel";

// Side-panel de comentarios firmados por perfil. En desktop es una columna;
// en mobile es un drawer. Realtime: los comentarios nuevos aparecen solos.

export function CommentsPanel({
  target,
  onClose,
}: {
  target: CommentTarget;
  onClose: () => void;
}) {
  const { profile } = useProfile();
  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const loadAuthors = useCallback(async () => {
    const { data } = await getSupabaseBrowserClient().from("profiles").select("id, name");
    const map: Record<string, string> = {};
    (data ?? []).forEach((p) => {
      map[p.id] = p.name;
    });
    setAuthors(map);
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await getSupabaseBrowserClient()
      .from("comments")
      .select("*")
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
  }, [target]);

  useEffect(() => {
    void loadAuthors();
    void refetch();
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comments-${target.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `target_id=eq.${target.id}`,
        },
        () => void refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [target, refetch, loadAuthors]);

  async function send() {
    const content = text.trim();
    if (!content || !profile || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_type: target.type,
          target_id: target.id,
          author_id: profile.id,
          content,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "No se pudo comentar");
        return;
      }
      setText("");
    } catch {
      toast.error("Error de red");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("No se pudo borrar el comentario");
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-neutral-900/40 md:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-neutral-200 bg-white md:static md:z-auto md:w-80 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Comentarios
            </p>
            <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
              sobre {target.type === "conversation" ? "la conversación" : "un mensaje"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
          {comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Sin comentarios todavía.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="group flex gap-2.5">
                <Avatar name={authors[c.author_id] ?? "Perfil"} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      {authors[c.author_id] ?? "Perfil"}
                    </span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                      {formatDistanceToNow(new Date(c.created_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                    <button
                      onClick={() => remove(c.id)}
                      className="ml-auto text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 dark:text-neutral-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap rounded-lg rounded-tl-sm bg-neutral-100 px-2.5 py-1.5 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {c.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 pl-3 transition focus-within:border-violet-400 focus-within:bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Escribí un comentario…"
              className="scroll-thin max-h-28 min-h-[32px] flex-1 resize-none self-center bg-transparent py-1.5 text-sm outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
              aria-label="Enviar comentario"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
