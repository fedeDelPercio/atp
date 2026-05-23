// ===========================================================================
// disconnect-watcher: detecta cuándo el panel pidió desconectar.
//
// El panel no puede llamar al bot directamente (procesos separados). Cuando
// el operador clickea "Desconectar", el endpoint /api/wa/connection/disconnect
// setea wa_connection_state.status='disconnected'. Este watcher polea cada
// 3s ese estado; si lo ve en 'disconnected' Y todavía hay sesión Baileys
// viva, hace fullDisconnect() (logout + borrar auth + setear estado limpio).
// ===========================================================================

import { getWaState } from "./connection-state";
import { fullDisconnect, getCurrentHandle } from "./baileys-client";

const POLL_INTERVAL_MS = 3000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startDisconnectWatcher(): void {
  if (timer) return;
  console.log("[bot] disconnect watcher arrancado (cada 3s)");
  timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    tick()
      .catch((err) => console.error("[bot] disconnect watcher error:", err))
      .finally(() => {
        inFlight = false;
      });
  }, POLL_INTERVAL_MS);
}

export function stopDisconnectWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  const state = await getWaState();
  if (!state) return;
  const handle = getCurrentHandle();
  // Si el panel quiere desconectar pero el bot está vivo: ejecutar shutdown.
  if (state.status === "disconnected" && handle && state.phone === null) {
    console.log("[bot] el panel pidió desconectar, ejecutando fullDisconnect...");
    await fullDisconnect();
  }
}
