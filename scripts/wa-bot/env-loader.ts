// ===========================================================================
// env-loader (side-effect only, sin exports)
//
// Carga `.env.local` ANTES de que cualquier otro módulo lea process.env.
// Crítico: los `import` en ES modules se hoistean al top del archivo y se
// ejecutan en orden de declaración DENTRO del bloque hoisted. Si un módulo
// leído por imports posteriores depende de process.env.X, este loader tiene
// que ser el PRIMER import del entry point.
// ===========================================================================

import path from "node:path";
import fs from "node:fs";
import Module from "node:module";

// Stub del paquete `server-only` (de Next.js). En Next existe para que
// cualquier import desde un Client Component tire error. En este script
// Node puro no aplica: lo neutralizamos devolviendo un objeto vacío.
const originalRequire = Module.prototype.require as unknown as (id: string) => unknown;
(Module.prototype as unknown as { require: (id: string) => unknown }).require = function (
  this: unknown,
  id: string,
) {
  if (id === "server-only") return {};
  return originalRequire.call(this as object, id);
};

const envPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  console.log(`[bot] env cargado desde ${envPath}`);
} else {
  console.warn(`[bot] .env.local no encontrado en ${envPath}, uso variables del sistema`);
}
