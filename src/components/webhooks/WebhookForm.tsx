"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";

// Formulario para dar de alta un webhook saliente.

const EVENTS = [
  "message.received",
  "agent.responded",
  "agent.escalated",
  "agent.failed",
] as const;

export function WebhookForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleEvent(ev: string) {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev],
    );
  }

  async function submit() {
    if (!name.trim() || !url.trim() || events.length === 0) {
      toast.error("Completá nombre, URL y al menos un evento");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/outbound-webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events,
          secret: secret.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear el webhook");
        return;
      }
      toast.success("Webhook creado");
      setName("");
      setUrl("");
      setEvents([]);
      setSecret("");
      onCreated();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        Nuevo webhook saliente
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… (URL destino)"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>
      <input
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="Secret para firma HMAC (opcional)"
        className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {EVENTS.map((ev) => (
          <button
            key={ev}
            onClick={() => toggleEvent(ev)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              events.includes(ev)
                ? "border-violet-400 bg-violet-50 font-medium text-violet-700 dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-300"
                : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
            }`}
          >
            {ev}
          </button>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={saving}
        className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Crear webhook
      </button>
    </div>
  );
}
