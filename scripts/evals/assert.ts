// ===========================================================================
// Matchers de las expectativas de cada turno. checkExpect devuelve la lista
// de fallas (vacía = pasó todo). Todo case-insensitive salvo el custom.
// ===========================================================================

import type { EvalTurnOutput } from "./harness";

export interface Expect {
  /** Espera notify_team con esta categoría exacta. */
  notifies?: string;
  /** Espera que el turno NO derive. */
  doesNotNotify?: boolean;
  /** Cada substring debe estar presente (case-insensitive). */
  contains?: string[];
  /** Cada substring debe estar ausente (case-insensitive). */
  notContains?: string[];
  /** El último carácter visible no puede ser "?" (debe ser afirmación). */
  notEndsWithQuestion?: boolean;
  /** Check libre: devolvé un mensaje de error o null si pasa. */
  custom?: (out: EvalTurnOutput) => string | null;
}

export function checkExpect(out: EvalTurnOutput, expect: Expect): string[] {
  const failures: string[] = [];
  const text = out.responseText;
  const lower = text.toLowerCase();

  if (expect.notifies !== undefined) {
    if (!out.notified) {
      failures.push(`esperaba derivar como '${expect.notifies}' pero NO derivó`);
    } else if (out.category !== expect.notifies) {
      failures.push(
        `esperaba '${expect.notifies}' pero derivó como '${out.category}'`,
      );
    }
  }

  if (expect.doesNotNotify && out.notified) {
    failures.push(`esperaba NO derivar pero derivó como '${out.category}'`);
  }

  for (const s of expect.contains ?? []) {
    if (!lower.includes(s.toLowerCase())) failures.push(`debería contener "${s}"`);
  }

  for (const s of expect.notContains ?? []) {
    if (lower.includes(s.toLowerCase())) failures.push(`NO debería contener "${s}"`);
  }

  if (expect.notEndsWithQuestion && text.trimEnd().endsWith("?")) {
    failures.push(`termina en "?" (debería ser afirmación)`);
  }

  if (expect.custom) {
    const err = expect.custom(out);
    if (err) failures.push(err);
  }

  return failures;
}
