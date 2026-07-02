"use client";

import { useEffect, useState } from "react";
import { BarChart3, Flame, Loader2, TrendingUp, Users } from "lucide-react";
import toast from "react-hot-toast";
import {
  SMART_TAG_LABEL,
  TEMPERATURA_DOT,
  TEMPERATURA_LABEL,
  TEMPERATURA_TEXT,
  TEMPERATURAS_ORDERED,
  SMART_TAGS_ORDERED,
} from "@/lib/leads/labels";
import { humanizeCategory, STATUS_OPTIONS } from "@/components/LeadDetailModal";
import type { LeadSmartTag, LeadTemperatura } from "@/lib/supabase/types";

// ===========================================================================
// Tab Dashboard: metricas agregadas sobre la tabla `leads` del cliente.
//
// Layout por breakpoint:
//   - mobile: 1 columna, todo apilado
//   - sm+   : 2 columnas para KPIs y gráficos
//   - lg+   : 4 columnas para KPIs, 2 para gráficos, 1 para timeline
//
// Charts en SVG puro (sin libs de graficos) siguiendo el design system del
// panel: paleta neutral con acentos semanticos (sky/orange/red para
// temperatura), un solo hue neutral para las series categoricas (single-hue
// bar chart — el label habla).
// ===========================================================================

interface Stats {
  total: number;
  newLast7d: number;
  hot: number;
  contactedPct: number;
  byTemperatura: Record<string, number>;
  bySmartTag: Record<string, number>;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  timeline: Array<{ date: string; count: number }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const r = await fetch("/api/dashboard/stats", { cache: "no-store" });
        if (!r.ok) throw new Error("fetch failed");
        const data = (await r.json()) as Stats;
        setStats(data);
      } catch {
        toast.error("No se pudo cargar el dashboard");
      } finally {
        setLoading(false);
      }
    }
    void fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-neutral-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        Cargando dashboard...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">
        Sin datos
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <BarChart3
            className="h-4 w-4 text-neutral-900 dark:text-neutral-50"
            strokeWidth={1.75}
          />
          <h1 className="text-[15px] font-medium tracking-tight-er text-neutral-900 dark:text-neutral-50">
            Dashboard
          </h1>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            {stats.total} {stats.total === 1 ? "lead total" : "leads totales"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiTile
              label="Total leads"
              value={stats.total.toString()}
              icon={Users}
            />
            <KpiTile
              label="Nuevos 7 días"
              value={stats.newLast7d.toString()}
              icon={TrendingUp}
            />
            <KpiTile
              label="Calientes"
              value={stats.hot.toString()}
              icon={Flame}
              accent="text-red-600 dark:text-red-500"
            />
            <KpiTile
              label="Contactados"
              value={`${stats.contactedPct}%`}
              icon={BarChart3}
            />
          </div>

          {/* Distribución por temperatura + smart tag */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Distribución por temperatura">
              <TemperaturaDonut data={stats.byTemperatura} />
            </Card>
            <Card title="Distribución por smart tag">
              <SingleHueBars
                data={SMART_TAGS_ORDERED.map((k) => ({
                  key: k,
                  label: SMART_TAG_LABEL[k],
                  count: stats.bySmartTag[k] ?? 0,
                }))}
              />
            </Card>
          </div>

          {/* Distribución por categoría + status */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Categorías por las que intervino el equipo">
              <CategoryBars data={stats.byCategory} />
            </Card>
            <Card title="Distribución por estado">
              <StatusBars data={stats.byStatus} />
            </Card>
          </div>

          {/* Timeline */}
          <Card title="Leads por día (últimos 30 días)">
            <Timeline data={stats.timeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes base
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <h2 className="mb-4 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      {children}
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        <Icon
          className={`h-3 w-3 ${accent ?? "text-neutral-400 dark:text-neutral-500"}`}
          strokeWidth={1.75}
        />
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-[24px] font-medium tracking-tight-er ${accent ?? "text-neutral-900 dark:text-neutral-50"}`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Donut chart de temperatura con colores semánticos (sky/orange/red). */
function TemperaturaDonut({ data }: { data: Record<string, number> }) {
  const ordered = TEMPERATURAS_ORDERED.map((k) => ({
    key: k,
    label: TEMPERATURA_LABEL[k],
    count: data[k] ?? 0,
  }));
  const total = ordered.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-[12px] text-neutral-400 dark:text-neutral-600">
        Sin datos aún
      </p>
    );
  }

  // Colores hex explicitos para el arc (Tailwind ring/text tokens no aplican
  // a stroke="currentColor" bien en modo dark, mejor hardcode + inversión).
  const COLOR: Record<LeadTemperatura, string> = {
    frio: "#0ea5e9", // sky-500
    tibio: "#f97316", // orange-500
    caliente: "#dc2626", // red-600
  };

  const size = 180;
  const r = 68;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        {/* Track gris de fondo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-100 dark:text-neutral-800"
        />
        {ordered.map((d) => {
          if (d.count === 0) return null;
          const frac = d.count / total;
          const arcLen = circumference * frac;
          // Separación de 2px entre segmentos (regla del design system).
          const gapPx = 2;
          const el = (
            <circle
              key={d.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={COLOR[d.key]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${Math.max(arcLen - gapPx, 0)} ${circumference}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += arcLen;
          return el;
        })}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          className="font-mono text-[10px] uppercase tracking-wide fill-neutral-400 dark:fill-neutral-500"
        >
          Total
        </text>
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          className="font-mono text-[20px] font-medium fill-neutral-900 dark:fill-neutral-50"
        >
          {total}
        </text>
      </svg>

      <ul className="flex flex-col gap-2">
        {ordered.map((d) => {
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <li
              key={d.key}
              className="flex items-center gap-2.5 text-[12px]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${TEMPERATURA_DOT[d.key]}`}
                aria-hidden
              />
              <span className="min-w-[70px] font-medium text-neutral-700 dark:text-neutral-300">
                {d.label}
              </span>
              <span className={`font-mono text-[11px] ${TEMPERATURA_TEXT[d.key]}`}>
                {d.count}
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface BarItem {
  key: string;
  label: string;
  count: number;
}

/** Horizontal bar chart de un solo hue. Bars ordenadas desc por count. */
function SingleHueBars({ data }: { data: BarItem[] }) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((d) => d.count));
  const hasData = sorted.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <p className="text-[12px] text-neutral-400 dark:text-neutral-600">
        Sin datos aún
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {sorted.map((d) => {
        const widthPct = max > 0 ? (d.count / max) * 100 : 0;
        return (
          <li key={d.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-neutral-700 dark:text-neutral-300">
                {d.label}
              </span>
              <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                {d.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-neutral-900 transition-[width] dark:bg-neutral-50"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Bar chart para categorías dinámicas (top 10). */
function CategoryBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
    .map(([key, count]) => ({
      key,
      label: humanizeCategory(key),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return <SingleHueBars data={entries} />;
}

/** Bar chart para status con dots del design system. */
function StatusBars({ data }: { data: Record<string, number> }) {
  const items = STATUS_OPTIONS.map((s) => ({
    key: s.value,
    label: s.label,
    dot: s.dot,
    count: data[s.value] ?? 0,
  }));
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((d) => d.count));
  const hasData = sorted.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <p className="text-[12px] text-neutral-400 dark:text-neutral-600">
        Sin datos aún
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {sorted.map((d) => {
        const widthPct = max > 0 ? (d.count / max) * 100 : 0;
        return (
          <li key={d.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${d.dot}`}
                  aria-hidden
                />
                {d.label}
              </span>
              <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                {d.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-neutral-900 transition-[width] dark:bg-neutral-50"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Timeline: line chart simple con área rellena. Últimos 30 días. */
function Timeline({ data }: { data: Array<{ date: string; count: number }> }) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <p className="text-[12px] text-neutral-400 dark:text-neutral-600">
        Sin datos aún
      </p>
    );
  }

  const width = 700;
  const height = 180;
  const padX = 20;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);

  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + chartH - (d.count / max) * chartH,
    date: d.date,
    count: d.count,
  }));

  const pathD =
    "M " + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
  const areaD =
    pathD +
    ` L ${padX + chartW},${padY + chartH} L ${padX},${padY + chartH} Z`;

  // Ticks de eje x: primer, medio, último día.
  const firstIdx = 0;
  const midIdx = Math.floor(data.length / 2);
  const lastIdx = data.length - 1;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-[20px] font-medium text-neutral-900 dark:text-neutral-50">
          {total}
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          leads · últimos 30 días
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full text-neutral-900 dark:text-neutral-50"
        style={{ height: "auto", maxHeight: 220 }}
      >
        {/* Grid line horizontal (guía sutil del máximo). */}
        <line
          x1={padX}
          x2={padX + chartW}
          y1={padY}
          y2={padY}
          className="stroke-neutral-100 dark:stroke-neutral-800"
          strokeWidth={1}
        />
        {/* Grid line del piso. */}
        <line
          x1={padX}
          x2={padX + chartW}
          y1={padY + chartH}
          y2={padY + chartH}
          className="stroke-neutral-200 dark:stroke-neutral-800"
          strokeWidth={1}
        />
        {/* Área rellena (sutil). */}
        <path d={areaD} fill="currentColor" fillOpacity={0.08} />
        {/* Línea principal (2px). */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Etiqueta del máximo (esq sup). */}
        <text
          x={padX + 4}
          y={padY - 6}
          className="font-mono text-[10px] uppercase tracking-wide fill-neutral-400 dark:fill-neutral-500"
        >
          Máx {max}
        </text>
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        <span>{fmtShortDate(data[firstIdx]?.date)}</span>
        <span>{fmtShortDate(data[midIdx]?.date)}</span>
        <span>{fmtShortDate(data[lastIdx]?.date)}</span>
      </div>
    </div>
  );
}

function fmtShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
