// ===========================================================================
// Entry point del bot de WhatsApp (Baileys).
//
// CRÍTICO: env-loader DEBE ser el primer import. Hoisting de ES modules
// hace que TODOS los imports se evalúen al inicio del archivo en orden de
// declaración. Si otro módulo lee process.env.X en su top-level, lee
// undefined si env-loader no se ejecutó antes.
// ===========================================================================

import "./env-loader";

import { startBot } from "./baileys-client";
import { startDisconnectWatcher, stopDisconnectWatcher } from "./disconnect-watcher";
import { setWaState } from "./connection-state";
import { getClientSlug } from "./supabase-client";

async function main(): Promise<void> {
  const slug = getClientSlug();
  console.log(`[bot] arrancando para client_slug='${slug}'`);

  // Estado inicial: si veníamos de 'connected' o 'qr', reset a 'disconnected'
  // hasta que la conexión real ocurra. El connection.update lo va a actualizar.
  // No lo hacemos para no pisar info útil de una conexión anterior viva.

  startDisconnectWatcher();

  try {
    await startBot();
  } catch (err) {
    console.error("[bot] error fatal arrancando:", err);
    await setWaState({
      status: "disconnected",
      last_error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("[bot] SIGINT, shutdown graceful...");
  stopDisconnectWatcher();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[bot] SIGTERM, shutdown graceful...");
  stopDisconnectWatcher();
  process.exit(0);
});

main();
