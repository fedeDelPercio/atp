"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  TEMPERATURA_DOT,
  TEMPERATURA_LABEL,
  TEMPERATURAS_ORDERED,
} from "@/lib/leads/labels";
import type { LeadTemperatura } from "@/lib/supabase/types";

// ===========================================================================
// Modulo Seguimientos: config del ritmo de recordatorios por temperatura.
//
// 3 cards (caliente, tibio, frio). En cada una: toggle enabled + primer
// intervalo (dias) + intervalo recurrente (dias). Guardar hace un unico
// PUT con las 3 reglas del cliente.
// ===========================================================================

interface Rule {
  temperatura: LeadTemperatura;
  first_interval_days: number;
  recurring_interval_days: number;
  enabled: boolean;
}

export default function SeguimientosPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Rule[] | null>(null);

  useEffect(() => {
    async function fetchRules() {
      try {
        const r = await fetch("/api/follow-up-rules", { cache: "no-store" });
        if (!r.ok) throw new Error("fetch failed");
        const json = (await r.json()) as { rules: Rule[] };
        // Ordenamos en orden fijo (caliente, tibio, frio) para consistencia
        // visual, sin importar el orden que devuelva la API.
        const byTemp = new Map(json.rules.map((rr) => [rr.temperatura, rr]));
        const sorted = TEMPERATURAS_ORDERED.map(
          (t) =>
            byTemp.get(t) ?? {
              temperatura: t,
              first_interval_days: 3,
              recurring_interval_days: 7,
              enabled: true,
            },
        );
        setRules(sorted);
        setOriginal(sorted);
      } catch {
        toast.error("No se pudieron cargar las reglas");
      } finally {
        setLoading(false);
      }
    }
    void fetchRules();
  }, []);

  const dirty = useMemo(() => {
    if (!rules || !original) return false;
    return rules.some((r, i) => {
      const o = original[i];
      if (!o) return true;
      return (
        r.first_interval_days !== o.first_interval_days ||
        r.recurring_interval_days !== o.recurring_interval_days ||
        r.enabled !== o.enabled
      );
    });
  }, [rules, original]);

  function updateRule(temp: LeadTemperatura, patch: Partial<Rule>) {
    setRules((curr) =>
      curr
        ? curr.map((r) => (r.temperatura === temp ? { ...r, ...patch } : r))
        : curr,
    );
  }

  async function handleSave() {
    if (!rules) return;
    setSaving(true);
    try {
      const r = await fetch("/api/follow-up-rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "PUT failed");
      }
      setOriginal(rules);
      toast.success("Reglas guardadas");
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <Settings2
            className="h-4 w-4 text-neutral-900 dark:text-neutral-50"
            strokeWidth={1.75}
          />
          <h1 className="text-[15px] font-medium tracking-tight-er text-neutral-900 dark:text-neutral-50">
            Seguimientos
          </h1>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            configuración del ritmo por temperatura
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          Guardar cambios
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-[12px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
            El ciclo arranca cuando el vendedor marca un lead como{" "}
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              Contactado
            </span>{" "}
            por primera vez. La <span className="font-medium">primera instancia</span>{" "}
            se dispara N días después de contactarlo; las{" "}
            <span className="font-medium">recurrentes</span> se generan cada vez
            que se marca la anterior como hecha. El ciclo termina cuando el
            lead pasa a Cerrado o Descartado.
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
              Cargando reglas...
            </div>
          ) : rules ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {rules.map((r) => (
                <RuleCard
                  key={r.temperatura}
                  rule={r}
                  onChange={(patch) => updateRule(r.temperatura, patch)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-neutral-400">Sin datos</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${TEMPERATURA_DOT[rule.temperatura]}`}
            aria-hidden
          />
          <h3 className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
            {TEMPERATURA_LABEL[rule.temperatura]}
          </h3>
        </div>
        <Toggle
          value={rule.enabled}
          onChange={(v) => onChange({ enabled: v })}
        />
      </div>

      <div className="space-y-3">
        <NumberField
          label="Primera instancia"
          hint="días desde que se marca contactado"
          value={rule.first_interval_days}
          disabled={!rule.enabled}
          onChange={(v) => onChange({ first_interval_days: v })}
        />
        <NumberField
          label="Periódica"
          hint="días entre las siguientes"
          value={rule.recurring_interval_days}
          disabled={!rule.enabled}
          onChange={(v) => onChange({ recurring_interval_days: v })}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-1 text-[11.5px] font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 1) onChange(Math.round(n));
          }}
          className="w-20 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] outline-none transition focus:border-neutral-400 disabled:cursor-not-allowed dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-600"
        />
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          días
        </span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-500">
        {hint}
      </p>
    </label>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        value
          ? "bg-neutral-900 dark:bg-neutral-50"
          : "bg-neutral-200 dark:bg-neutral-800"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition dark:bg-neutral-950 ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
