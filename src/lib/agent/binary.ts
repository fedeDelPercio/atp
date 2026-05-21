import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";

// ===========================================================================
// Resolucion del binario nativo del Claude Agent SDK.
//
// El SDK tiene un binario platform-specific como optional dependency. En
// algunos entornos serverless (Vercel) el resolver del SDK no lo encuentra
// solo aunque este instalado en node_modules. Para esos casos apuntamos al
// binario explicitamente con `options.pathToClaudeCodeExecutable`.
//
// En local (Windows/Mac/dev) devolvemos undefined: el SDK resuelve via
// require.resolve normal, que es lo que ya funciona.
// ===========================================================================

let cached: string | null | undefined;

/**
 * Devuelve el path absoluto al binario del SDK si necesitamos override.
 * Devuelve undefined si conviene dejar que el SDK lo resuelva solo.
 */
export function resolveClaudeCodeExecutable(): string | undefined {
  if (cached !== undefined) return cached ?? undefined;

  // Solo override en Linux x64 (entorno tipico de Vercel).
  if (process.platform !== "linux" || process.arch !== "x64") {
    cached = null;
    return undefined;
  }

  const candidates = [
    join(
      process.cwd(),
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk-linux-x64",
      "claude",
    ),
    join(
      "/var/task",
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk-linux-x64",
      "claude",
    ),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      cached = path;
      console.log(`[binary] usando claude binary en: ${path}`);
      return path;
    }
  }

  console.warn(
    `[binary] NO se encontro el binario de claude-agent-sdk-linux-x64 en ninguno de:\n` +
      candidates.map((c) => `  - ${c}`).join("\n"),
  );
  cached = null;
  return undefined;
}
