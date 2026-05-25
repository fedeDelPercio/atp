"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";
import { useProfile } from "./ProfileProvider";

// Modal para crear una conversacion de prueba. Pide el nombre del cliente
// simulado (ej: "Juan - busca 2 amb").

export function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const { profile } = useProfile();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    const displayName = name.trim();
    if (!displayName) {
      toast.error("Ingresá un nombre para el cliente simulado");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          created_by: profile?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear la conversación");
        return;
      }
      onCreated(data.conversation.id);
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Nueva conversación
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              Cada conversación simula un cliente distinto.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          placeholder='Ej: "Juan, busca 2 ambientes"'
          className="mt-4 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-600"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            onClick={create}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
