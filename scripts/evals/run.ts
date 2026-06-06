// ===========================================================================
// Entry point del harness de evals.
//
//   npm run eval            -> corre todos los escenarios
//   npm run eval -- <texto> -> corre solo los que matcheen ese texto en el nombre
//
// Side effect: escribe scripts/evals/results.md con la transcripción completa
// de cada turno (input del usuario, respuesta de Mica, notify_team si hubo,
// PASS/FAIL con motivo). Ese .md se commitea junto con cualquier cambio de
// prompt como evidencia de qué se valida.
//
// IMPORTANTE: `import "./env"` tiene que ser el PRIMER import (carga
// .env.local antes de que harness.ts instancie el cliente de Anthropic).
// ===========================================================================

import "./env";

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { runOrchestratorEval, type EvalTurnOutput } from "./harness";
import { checkExpect } from "./assert";
import { SCENARIOS, type Scenario, type Turn } from "./scenarios";
import type { HistoryMessage } from "../../src/lib/agent/types";

interface TurnRecord {
  user: string;
  response: string;
  notified: boolean;
  category: string | null;
  passes: boolean | null; // null si no hay assertions
  failures: string[];
}

interface ScenarioRecord {
  name: string;
  now: string;
  isExistingCustomer: boolean;
  turns: TurnRecord[];
  asserts: number;
  failed: number;
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

async function runOneTurn(args: {
  turn: Turn;
  sc: Scenario;
  history: HistoryMessage[];
}): Promise<{ out: EvalTurnOutput; record: TurnRecord; assertCount: 0 | 1; failCount: 0 | 1 }> {
  const customerMessageCount =
    args.history.filter((m) => m.role === "user").length + 1;

  const out = await runOrchestratorEval({
    history: args.history,
    userMessage: args.turn.user,
    now: new Date(args.sc.now),
    customerMessageCount,
    isExistingCustomer: args.sc.isExistingCustomer ?? false,
  });

  let assertCount: 0 | 1 = 0;
  let failCount: 0 | 1 = 0;
  let failures: string[] = [];
  let passes: boolean | null = null;
  if (args.turn.expect) {
    assertCount = 1;
    failures = checkExpect(out, args.turn.expect);
    passes = failures.length === 0;
    if (!passes) failCount = 1;
  }

  return {
    out,
    record: {
      user: args.turn.user,
      response: out.responseText,
      notified: out.notified,
      category: out.category,
      passes,
      failures,
    },
    assertCount,
    failCount,
  };
}

async function runScenario(sc: Scenario): Promise<ScenarioRecord> {
  console.log(`\n━━━ ${sc.name}`);
  const history: HistoryMessage[] = [];
  const turns: TurnRecord[] = [];
  let asserts = 0;
  let failed = 0;

  for (const turn of sc.turns) {
    const { out, record, assertCount, failCount } = await runOneTurn({
      turn,
      sc,
      history,
    });
    asserts += assertCount;
    failed += failCount;
    turns.push(record);

    console.log(`\n  >> ${turn.user}`);
    if (record.response) console.log(indent(record.response, "  << "));
    else console.log("  << (sin texto visible)");
    if (out.notified) console.log(`     [notify_team: ${out.category}]`);
    if (record.passes === true) console.log("     PASS");
    else if (record.passes === false) {
      for (const f of record.failures) console.log(`     FAIL: ${f}`);
    }

    history.push({ role: "user", content: turn.user });
    if (record.response) {
      history.push({ role: "assistant", content: record.response });
    }
  }

  return {
    name: sc.name,
    now: sc.now,
    isExistingCustomer: sc.isExistingCustomer ?? false,
    turns,
    asserts,
    failed,
  };
}

// --- Markdown report -------------------------------------------------------

function formatNow(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(turn: TurnRecord): string {
  if (turn.passes === null) return "(sin assertions)";
  return turn.passes ? "**PASS**" : "**FAIL**";
}

function quoteBlock(text: string): string {
  if (!text) return "> _(sin texto visible — el cliente NO recibe nada)_";
  return text
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
}

function writeResultsMd(args: {
  records: ScenarioRecord[];
  totalAsserts: number;
  totalFailed: number;
  model: string;
}): string {
  const path = join(process.cwd(), "scripts", "evals", "results.md");
  const lines: string[] = [];
  const passing = args.totalAsserts - args.totalFailed;

  lines.push("# Evals — Quintaglia (Mica)");
  lines.push("");
  lines.push(
    "Generado automáticamente por `npm run eval`. Cada escenario corre " +
      "contra el orquestador real (modelo + prompt + KB + tool de prod), " +
      "valida lo que recibiría el cliente y deja el output abajo para revisar a mano.",
  );
  lines.push("");
  lines.push(`- **Modelo:** \`${args.model}\``);
  lines.push(
    `- **Resultado:** ${passing}/${args.totalAsserts} turnos con aserciones OK` +
      (args.totalFailed ? `, **${args.totalFailed} fallas**` : ""),
  );
  lines.push(`- **Escenarios corridos:** ${args.records.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const sc of args.records) {
    const scStatus = sc.failed === 0 ? "OK" : `${sc.failed} falla(s)`;
    lines.push(`## ${sc.name} — ${scStatus}`);
    lines.push("");
    lines.push(
      `- Reloj simulado: ${formatNow(sc.now)} (Argentina)` +
        (sc.isExistingCustomer ? " · cliente ya registrado" : ""),
    );
    lines.push("");

    for (let i = 0; i < sc.turns.length; i++) {
      const t = sc.turns[i];
      if (!t) continue;
      lines.push(`### Turno ${i + 1} · ${statusBadge(t)}`);
      lines.push("");
      lines.push(`**Cliente:** ${t.user}`);
      lines.push("");
      lines.push("**Mica:**");
      lines.push("");
      lines.push(quoteBlock(t.response));
      lines.push("");
      if (t.notified) {
        lines.push(`> _[notify_team → \`${t.category}\`]_`);
        lines.push("");
      }
      if (t.failures.length > 0) {
        lines.push("**Fallas:**");
        for (const f of t.failures) lines.push(`- ${f}`);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  writeFileSync(path, lines.join("\n"), "utf8");
  return path;
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const filter = process.argv.slice(2).join(" ").trim().toLowerCase();
  const scenarios = filter
    ? SCENARIOS.filter((s) => s.name.toLowerCase().includes(filter))
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.log(`No hay escenarios que matcheen "${filter}".`);
    process.exit(0);
  }

  console.log(
    `[eval] corriendo ${scenarios.length} escenario(s) contra el orquestador real\n`,
  );

  const records: ScenarioRecord[] = [];
  let totalAsserts = 0;
  let totalFailed = 0;
  for (const sc of scenarios) {
    const r = await runScenario(sc);
    records.push(r);
    totalAsserts += r.asserts;
    totalFailed += r.failed;
  }

  const model =
    process.env.ANTHROPIC_MODEL_ORCHESTRATOR ?? "claude-sonnet-4-6";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `Resultado: ${totalAsserts - totalFailed}/${totalAsserts} turnos con aserciones OK` +
      (totalFailed ? `, ${totalFailed} con fallas` : ""),
  );

  // Solo escribimos el .md si corrimos la suite completa (sin filtro) — con
  // filtro queda un .md parcial que confunde más que ayuda.
  if (!filter) {
    const path = writeResultsMd({
      records,
      totalAsserts,
      totalFailed,
      model,
    });
    console.log(`Reporte escrito en: ${path}`);
  } else {
    console.log(
      "(corriste con filtro: no actualizo results.md para no dejar uno parcial)",
    );
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[eval] error fatal:", err);
  process.exit(1);
});
