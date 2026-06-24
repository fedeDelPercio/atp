"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  UserCheck,
  Home,
} from "lucide-react";
import toast from "react-hot-toast";
import { useProfile } from "@/components/ProfileProvider";
import { Avatar } from "@/components/Avatar";
import {
  LeadDetailModal,
  STATUS_OPTIONS,
  humanizeCategory,
} from "@/components/LeadDetailModal";
import type {
  Lead,
  LeadSmartTag,
  LeadStatus,
  LeadTemperatura,
} from "@/lib/supabase/types";
import {
  SMART_TAG_LABEL,
  SMART_TAGS_ORDERED,
  TEMPERATURA_DOT,
  TEMPERATURA_LABEL,
  TEMPERATURA_TEXT,
  TEMPERATURAS_ORDERED,
} from "@/lib/leads/labels";

// Tab Leads: contactos calificados que el agente derivo al equipo.
// Cada lead linkea a su conversacion en /wa o /conversations segun el source
// de la conversacion. El estado se edita inline desde el dropdown; los
// detalles + observaciones del vendedor se editan dentro del modal
// (LeadDetailModal, compartido con el ConversationPanel).

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

export default function LeadsPage() {
  const { profile } = useProfile();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [smartTagFilter, setSmartTagFilter] = useState<LeadSmartTag | "all">(
    "all",
  );
  const [temperaturaFilter, setTemperaturaFilter] = useState<
    LeadTemperatura | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Traemos SIEMPRE la lista completa y filtramos client-side. De esta forma
  // los contadores de cada tab quedan estables (cantidad real por estado) en
  // lugar de cambiar segun el filtro activo. La lista de leads de un cliente
  // es chica (decenas, eventual centenas) — paginacion no aplica todavia.
  const fetchLeads = useCallback(async () => {
    try {
      const r = await fetch("/api/leads", { cache: "no-store" });
      const json = await r.json();
      setLeads((json.leads ?? []) as Lead[]);
    } catch {
      toast.error("No se pudieron cargar los leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const s of STATUS_OPTIONS) {
      c[s.value] = leads.filter((l) => l.status === s.value).length;
    }
    return c;
  }, [leads]);

  const visibleLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (smartTagFilter !== "all" && l.smart_tag !== smartTagFilter) return false;
      if (temperaturaFilter !== "all" && l.temperatura !== temperaturaFilter)
        return false;
      if (categoryFilter !== "all" && l.interest_category !== categoryFilter)
        return false;
      if (q) {
        const hay = `${l.name ?? ""} ${l.phone ?? ""} ${l.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    leads,
    statusFilter,
    smartTagFilter,
    temperaturaFilter,
    categoryFilter,
    searchQuery,
  ]);

  // Categorias presentes en la lista actual de leads. Se calcula sobre la
  // lista completa (no filtrada) para que el dropdown muestre todas las
  // categorias existentes en el cliente. Excluye 'sin_categoria' (no aporta).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      if (l.interest_category && l.interest_category !== "sin_categoria") {
        set.add(l.interest_category);
      }
    }
    return Array.from(set).sort();
  }, [leads]);

  async function patchLead(leadId: string, payload: Partial<Lead>): Promise<Lead | null> {
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("update failed");
      const json = await r.json();
      return (json.lead ?? null) as Lead | null;
    } catch {
      toast.error("No se pudo actualizar el lead");
      return null;
    }
  }

  async function updateStatus(leadId: string, status: LeadStatus) {
    const previous = leads;
    setLeads((curr) =>
      curr.map((l) =>
        l.id === leadId
          ? {
              ...l,
              status,
              contacted_at: status === "contactado" ? new Date().toISOString() : l.contacted_at,
            }
          : l,
      ),
    );
    const updated = await patchLead(leadId, {
      status,
      contacted_by: status === "contactado" ? (profile?.id ?? null) : null,
    });
    if (!updated) {
      setLeads(previous);
    } else if (selectedLead?.id === leadId) {
      setSelectedLead(updated);
    }
  }

  async function updateLeadFields(leadId: string, payload: Partial<Lead>) {
    const updated = await patchLead(leadId, payload);
    if (updated) {
      setLeads((curr) => curr.map((l) => (l.id === leadId ? updated : l)));
      if (selectedLead?.id === leadId) setSelectedLead(updated);
      toast.success("Lead actualizado");
    }
  }

  async function deleteLead(leadId: string) {
    try {
      const r = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      setLeads((curr) => curr.filter((l) => l.id !== leadId));
      if (selectedLead?.id === leadId) setSelectedLead(null);
      toast.success("Lead eliminado");
    } catch {
      toast.error("No se pudo eliminar el lead");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <UserCheck className="h-4 w-4 text-neutral-900 dark:text-neutral-50" strokeWidth={1.75} />
          <h1 className="text-[15px] font-medium tracking-tight-er text-neutral-900 dark:text-neutral-50">
            Leads
          </h1>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            {visibleLeads.length} {visibleLeads.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        <div className="relative flex w-full items-center sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email"
            className="w-full rounded-md border border-neutral-200 bg-white pl-7 pr-3 py-1.5 text-[12px] outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(["all", ...STATUS_OPTIONS.map((s) => s.value)] as const).map((value) => {
            const active = statusFilter === value;
            const opt = STATUS_OPTIONS.find((s) => s.value === value);
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value as LeadStatus | "all")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-neutral-50 dark:text-neutral-950"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }`}
              >
                {opt && <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} aria-hidden />}
                {value === "all" ? "Todos" : opt?.label}
                <span
                  className={`font-mono text-[10.5px] ${active ? "opacity-80" : "text-neutral-400 dark:text-neutral-500"}`}
                >
                  {counts[value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-6 py-2.5 dark:border-neutral-800">
        <FilterSelect
          label="Tag"
          value={smartTagFilter}
          onChange={(v) => setSmartTagFilter(v as LeadSmartTag | "all")}
          options={[
            { value: "all", label: "Todos los tags" },
            ...SMART_TAGS_ORDERED.map((t) => ({
              value: t,
              label: SMART_TAG_LABEL[t],
            })),
          ]}
        />
        <FilterSelect
          label="Temperatura"
          value={temperaturaFilter}
          onChange={(v) => setTemperaturaFilter(v as LeadTemperatura | "all")}
          options={[
            { value: "all", label: "Todas las temperaturas" },
            ...TEMPERATURAS_ORDERED.map((t) => ({
              value: t,
              label: TEMPERATURA_LABEL[t],
            })),
          ]}
        />
        <FilterSelect
          label="Categoría"
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v)}
          options={[
            { value: "all", label: "Todas las categorías" },
            ...categories.map((c) => ({ value: c, label: humanizeCategory(c) })),
          ]}
        />
        {(smartTagFilter !== "all" ||
          temperaturaFilter !== "all" ||
          categoryFilter !== "all") && (
          <button
            onClick={() => {
              setSmartTagFilter("all");
              setTemperaturaFilter("all");
              setCategoryFilter("all");
            }}
            className="ml-1 text-[12px] text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-neutral-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> Cargando leads...
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <UserCheck
              className="h-8 w-8 text-neutral-300 dark:text-neutral-700"
              strokeWidth={1.5}
            />
            <div>
              <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                Sin leads {statusFilter === "all" ? "" : `en estado ${statusFilter}`}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-500">
                Cuando el agente derive un contacto al equipo va a aparecer acá
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 hidden grid-cols-[1fr_140px_120px_140px_auto] gap-4 border-b border-neutral-200 bg-white px-6 py-2 font-mono text-[10px] uppercase tracking-wide text-neutral-400 sm:grid dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
              <span>Datos</span>
              <span>Tipo</span>
              <span>Temperatura</span>
              <span>Step</span>
              <span />
            </div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {visibleLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onStatusChange={updateStatus}
                  onSelect={() => setSelectedLead(lead)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={updateStatus}
          onSave={updateLeadFields}
          onDelete={deleteLead}
        />
      )}
    </div>
  );
}

function LeadRow({
  lead,
  onStatusChange,
  onSelect,
}: {
  lead: Lead;
  onStatusChange: (id: string, status: LeadStatus) => Promise<void>;
  onSelect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusOpt =
    STATUS_OPTIONS.find((s) => s.value === lead.status) ?? STATUS_OPTIONS[0]!;

  const isWa = lead.phone && /^\d+$/.test(lead.phone);
  const linkBase = isWa ? "/wa" : "/conversations";

  return (
    <li
      className="grid cursor-pointer grid-cols-1 gap-2 px-6 py-3 transition hover:bg-neutral-50 sm:grid-cols-[1fr_140px_120px_140px_auto] sm:items-center sm:gap-4 dark:hover:bg-neutral-900/40"
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={lead.name ?? lead.phone ?? "Lead"} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
              {lead.name ?? "Sin nombre"}
            </p>
            {lead.interest_category && lead.interest_category !== "sin_categoria" && (
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {humanizeCategory(lead.interest_category)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-neutral-500 dark:text-neutral-500">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" strokeWidth={1.75} />
              {lead.phone ?? "—"}
            </span>
            {lead.unit_typology && (
              <span className="flex items-center gap-1">
                <Home className="h-3 w-3" strokeWidth={1.75} />
                {lead.unit_typology}
              </span>
            )}
            <span className="font-mono text-[10.5px] uppercase tracking-wide">
              {formatDate(lead.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="text-[12px] text-neutral-700 dark:text-neutral-300">
        {lead.smart_tag ? (
          <span className="inline-flex items-center rounded-md border border-neutral-200 px-1.5 py-0.5 text-[10.5px] font-medium tracking-tight-er dark:border-neutral-800">
            {SMART_TAG_LABEL[lead.smart_tag as LeadSmartTag] ?? lead.smart_tag}
          </span>
        ) : (
          <span className="text-neutral-400 dark:text-neutral-600">—</span>
        )}
      </div>

      <div>
        {lead.temperatura ? (
          <span
            className={`inline-flex items-center gap-1 text-[11.5px] font-medium tracking-tight-er ${TEMPERATURA_TEXT[lead.temperatura as LeadTemperatura]}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${TEMPERATURA_DOT[lead.temperatura as LeadTemperatura]}`}
              aria-hidden
            />
            {TEMPERATURA_LABEL[lead.temperatura as LeadTemperatura]}
          </span>
        ) : (
          <span className="text-[12px] text-neutral-400 dark:text-neutral-600">—</span>
        )}
      </div>

      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-700 transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
        >
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${statusOpt.dot}`} aria-hidden />
            {statusOpt.label}
          </span>
          <ChevronDown className="h-3 w-3 text-neutral-400" strokeWidth={2} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-[60] mt-1 w-48 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setMenuOpen(false);
                    if (opt.value !== lead.status) {
                      void onStatusChange(lead.id, opt.value);
                    }
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition ${
                    opt.value === lead.status
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                      : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} aria-hidden />
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Link
        href={`${linkBase}?id=${lead.conversation_id}`}
        onClick={(e) => e.stopPropagation()}
        className="hidden items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-600 transition hover:border-neutral-300 hover:bg-white sm:flex dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <MessageCircle className="h-3 w-3" strokeWidth={1.75} /> Ver conversación
      </Link>

    </li>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-neutral-500 dark:text-neutral-500">
      <span className="font-mono uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-700 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
