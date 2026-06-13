// ===========================================================================
// Follow-up poller: cada FOLLOW_UP_POLL_INTERVAL_MS pega al endpoint
// /api/follow-ups/dispatch del panel para disparar el envio de follow-ups.
//
// Por que aca y no en Vercel Cron:
//   El plan Hobby de Vercel solo permite cron schedules diarios. Como
//   queremos resolucion de 1 minuto (delay configurable, 5 min en test,
//   24 hs en prod), polleamos desde el bot que corre 24/7 en EasyPanel.
//
// Salvaguardas:
//   - Si `APP_URL` o `CRON_SECRET` no estan seteados, el poller no arranca
//     y loggea una vez.
//   - Si el endpoint falla (red, 500), se loggea y se intenta de nuevo en
//     el proximo tick. No reintenta dentro del mismo tick.
//   - El "tick anterior todavia corriendo" se cubre con inFlight (igual
//     patron que outbox-poller).
// ===========================================================================

const DEFAULT_POLL_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

function getAppUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    null;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

function getCronSecret(): string | null {
  return process.env.CRON_SECRET ?? null;
}

function getPollInterval(): number {
  const raw = process.env.FOLLOW_UP_POLL_INTERVAL_MS;
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 10_000) {
    console.warn(
      `[bot] FOLLOW_UP_POLL_INTERVAL_MS invalido (${raw}); uso default ${DEFAULT_POLL_INTERVAL_MS}`,
    );
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return n;
}

export function startFollowUpPoller(): void {
  if (timer) return;

  const appUrl = getAppUrl();
  const cronSecret = getCronSecret();

  if (!appUrl || !cronSecret) {
    console.warn(
      "[bot] follow-up poller NO arrancado: falta NEXT_PUBLIC_APP_URL/APP_URL o CRON_SECRET",
    );
    return;
  }

  const interval = getPollInterval();
  console.log(
    `[bot] follow-up poller arrancado (cada ${Math.round(interval / 1000)}s, target=${appUrl})`,
  );

  timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void tick(appUrl, cronSecret).finally(() => {
      inFlight = false;
    });
  }, interval);
}

export function stopFollowUpPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[bot] follow-up poller detenido");
  }
}

async function tick(appUrl: string, cronSecret: string): Promise<void> {
  const target = `${appUrl}/api/follow-ups/dispatch`;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[bot] follow-up dispatch fallo HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
      return;
    }
    const body = (await res.json().catch(() => null)) as
      | { enabled?: boolean; candidates?: number; dispatched?: number }
      | null;
    if (body && (body.candidates ?? 0) > 0) {
      console.log(
        `[bot] follow-up tick: enabled=${body.enabled} candidates=${body.candidates} dispatched=${body.dispatched}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bot] follow-up dispatch error de red: ${message}`);
  }
}
