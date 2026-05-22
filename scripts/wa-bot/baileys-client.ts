// ===========================================================================
// Cliente Baileys con lecciones aprendidas incorporadas:
//   1. fetchLatestBaileysVersion() para evitar code 405.
//   2. Browsers.macOS('Desktop') para evitar code 440 loop.
//   3. Sin printQRInTerminal: true (deprecated).
//   4. State machine estricta del connection.update.
//   5. Backoff 15s para code 440, 5s para los demás.
//   6. sock.end() antes de reconnect.
// ===========================================================================

import path from "node:path";
import fs from "node:fs";
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrTerminal from "qrcode-terminal";
import { setWaState, getWaState } from "./connection-state";
import { handleIncomingMessages } from "./message-handler";
import { startOutboxPoller, stopOutboxPoller } from "./outbox-poller";

const AUTH_DIR = process.env.WA_AUTH_DIR ?? path.resolve(process.cwd(), "auth");

export interface BotHandle {
  sock: WASocket;
  shutdown: () => Promise<void>;
}

let currentHandle: BotHandle | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

/**
 * Arranca el bot. Si no hay sesión guardada en AUTH_DIR, genera QR y
 * escribe wa_connection_state.qr_string para que el panel lo muestre.
 */
export async function startBot(): Promise<BotHandle> {
  // Asegurar carpeta de auth.
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Versión de WhatsApp Web. SIEMPRE descargar la última (Baileys hardcodea
  // una que queda vieja entre releases).
  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    console.log(`[bot] usando WhatsApp Web version ${version.join(".")}`);
  } catch (err) {
    console.warn("[bot] no se pudo obtener última version de WhatsApp Web:", err);
  }

  const logger = pino({ level: "silent" }) as unknown as Parameters<typeof makeWASocket>[0]["logger"];

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // === connection.update — state machine ===
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[bot] QR recibido, escribiendo en wa_connection_state...");
      qrTerminal.generate(qr, { small: true });
      await setWaState({ status: "qr", qr_string: qr, phone: null, last_error: null });
    }

    if (connection === "connecting") {
      const current = await getWaState();
      // Solo degradar a 'connecting' si veníamos de 'disconnected' (primer
      // arranque). NO degradar desde 'qr' (perdemos el QR) ni desde 'connected'.
      if (!current || current.status === "disconnected") {
        await setWaState({ status: "connecting" });
      }
    }

    if (connection === "open") {
      const userId = sock.user?.id ?? "";
      // Formato típico: 5491155...:N@s.whatsapp.net
      const phone = userId.split(":")[0]?.split("@")[0] ?? null;
      console.log(`[bot] conectado, número ${phone}`);
      await setWaState({
        status: "connected",
        phone,
        qr_string: null,
        last_error: null,
      });
    }

    if (connection === "close") {
      const code =
        (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
          ?.statusCode ?? null;
      const message = lastDisconnect?.error?.message ?? "desconocido";
      console.warn(`[bot] connection close, code=${code}, message=${message}`);

      if (code === DisconnectReason.loggedOut) {
        // 401: el usuario cerró sesión desde su teléfono o se borró el auth.
        // No reconectar; esperar nueva conexión manual desde el panel.
        await setWaState({
          status: "disconnected",
          qr_string: null,
          phone: null,
          last_error: "logged_out",
        });
        if (currentHandle) {
          try {
            currentHandle.sock.end(undefined);
          } catch {}
          currentHandle = null;
        }
        return;
      }

      // Cualquier otro código: schedule reconnect. NO modificar el estado en
      // la DB — si estábamos 'connected', queremos seguir mostrando connected
      // mientras reconectamos transparentemente.
      scheduleReconnect(code);
    }
  });

  sock.ev.on("messages.upsert", async (event) => {
    if (event.type !== "notify") return;
    for (const msg of event.messages) {
      try {
        await handleIncomingMessages(sock, msg);
      } catch (err) {
        console.error("[bot] error procesando mensaje:", err);
      }
    }
  });

  const handle: BotHandle = {
    sock,
    shutdown: async () => {
      console.log("[bot] shutdown...");
      stopOutboxPoller();
      try {
        sock.end(undefined);
      } catch {}
    },
  };

  // Arrancar poller del outbox (mensajes humanos del panel).
  startOutboxPoller(sock);

  currentHandle = handle;
  return handle;
}

function scheduleReconnect(code: number | null): void {
  if (reconnectTimer) return;
  // Code 440 = connectionReplaced. Si reintentamos muy rápido entramos en
  // loop porque WhatsApp abre dos WS y kickea uno. Esperar 15s.
  const delay = code === 440 ? 15000 : 5000;
  console.log(`[bot] reconectando en ${delay / 1000}s...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (currentHandle) {
      try {
        currentHandle.sock.end(undefined);
      } catch {}
      currentHandle = null;
    }
    try {
      await startBot();
    } catch (err) {
      console.error("[bot] error reconectando:", err);
      scheduleReconnect(null);
    }
  }, delay);
}

/** Borra la sesión de auth y desconecta. El próximo start() pedirá QR nuevo. */
export async function fullDisconnect(): Promise<void> {
  if (currentHandle) {
    try {
      await currentHandle.sock.logout();
    } catch {}
    try {
      currentHandle.sock.end(undefined);
    } catch {}
    currentHandle = null;
  }
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  await setWaState({
    status: "disconnected",
    qr_string: null,
    phone: null,
    last_error: null,
  });
}

export function getCurrentHandle(): BotHandle | null {
  return currentHandle;
}
