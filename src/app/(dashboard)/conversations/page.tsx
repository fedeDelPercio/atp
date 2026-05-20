"use client";

import { useState } from "react";
import { Menu, MessagesSquare } from "lucide-react";
import { useProfile } from "@/components/ProfileProvider";
import { ConversationList } from "@/components/ConversationList";
import { ConversationPanel, type CommentTarget } from "@/components/ConversationPanel";
import { CommentsPanel } from "@/components/CommentsPanel";
import { JobsDebugPanel } from "@/components/JobsDebugPanel";

// Tab Conversaciones: lista + panel + side-panel de comentarios.
// En mobile la lista es un drawer (se abre con la hamburguesa).

export default function ConversationsPage() {
  const { profile } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      <ConversationList
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setCommentTarget(null);
          setSidebarOpen(false);
        }}
      />

      {selectedId ? (
        <ConversationPanel
          key={selectedId}
          conversationId={selectedId}
          onOpenComments={setCommentTarget}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center dark:bg-neutral-950">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <MessagesSquare className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Ninguna conversación seleccionada
            </p>
            <p className="mt-0.5 text-sm text-neutral-400 dark:text-neutral-500">
              Elegí una de la lista o creá una nueva para empezar.
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 md:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Menu className="h-4 w-4" /> Ver conversaciones
          </button>
        </div>
      )}

      {commentTarget && (
        <CommentsPanel target={commentTarget} onClose={() => setCommentTarget(null)} />
      )}

      {/* Panel de debugging del worker: solo para perfiles dev. */}
      {profile?.role === "dev" && <JobsDebugPanel />}
    </div>
  );
}
