"use client";

import { Eye, Layers } from "lucide-react";
import type { ViewMode } from "@/lib/profile";

// Toggle Vista simple / Vista avanzada, estilo control segmentado.
// La preferencia se persiste por perfil (ver profile.ts).

const OPTIONS = [
  { value: "simple" as const, label: "Simple", icon: Eye },
  { value: "advanced" as const, label: "Avanzada", icon: Layers },
];

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-neutral-100 p-0.5 text-xs dark:bg-neutral-800">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 transition ${
            mode === value
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
