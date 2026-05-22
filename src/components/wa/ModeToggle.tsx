"use client";

import { Bot, User2 } from "lucide-react";
import type { ConversationMode } from "@/lib/supabase/types";

// Switch AI/HUMAN para una conversación de WhatsApp.
// AI: Mica responde automaticamente.
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
    <div className="inline-flex items-center rounded-full bg-neutral-100 p-0.5 text-xs dark:bg-neutral-800">
      <button
        onClick={() => onChange("AI")}
        disabled={disabled || mode === "AI"}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
          mode === "AI"
            ? "bg-emerald-500 font-medium text-white shadow-sm"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <Bot className="h-3.5 w-3.5" />
        IA
      </button>
      <button
        onClick={() => onChange("HUMAN")}
        disabled={disabled || mode === "HUMAN"}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
          mode === "HUMAN"
            ? "bg-amber-500 font-medium text-white shadow-sm"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <User2 className="h-3.5 w-3.5" />
        Humano
      </button>
    </div>
  );
}
