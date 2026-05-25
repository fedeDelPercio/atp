"use client";

import { Bot, User2 } from "lucide-react";
import type { ConversationMode } from "@/lib/supabase/types";

// Switch AI/HUMAN para una conversación de WhatsApp.
// AI: Mica responde automáticamente.
// HUMAN: Mica queda muda, un asesor escribe desde el composer.

export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ConversationMode;
  onChange: (mode: ConversationMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-neutral-200 bg-white p-0.5 text-[11.5px] dark:border-neutral-800 dark:bg-neutral-950">
      <button
        onClick={() => onChange("AI")}
        disabled={disabled || mode === "AI"}
        className={`flex items-center gap-1.5 rounded-sm px-2 py-1 transition ${
          mode === "AI"
            ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <Bot className="h-3 w-3" strokeWidth={1.75} />
        IA
      </button>
      <button
        onClick={() => onChange("HUMAN")}
        disabled={disabled || mode === "HUMAN"}
        className={`flex items-center gap-1.5 rounded-sm px-2 py-1 transition ${
          mode === "HUMAN"
            ? "bg-amber-50 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <User2 className="h-3 w-3" strokeWidth={1.75} />
        Humano
      </button>
    </div>
  );
}
