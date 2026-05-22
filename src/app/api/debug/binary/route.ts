import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ===========================================================================
// GET /api/debug/binary
//
// Endpoint diagnostico: corre el binario del SDK con --version y captura
// stdout/stderr/exitCode/error. Sirve para entender por que cuando el SDK
// lo spawnea no yieldea ningun mensaje.
//
// SEGURIDAD: este endpoint expone informacion de runtime. Esta protegido
// con el mismo CRON_SECRET que /api/jobs/process para no exponerlo.
// ===========================================================================

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header =
    new URL(req.url).searchParams.get("secret") ??
    req.headers.get("x-cron-secret");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const candidates = [
    join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk-linux-x64", "claude"),
    join("/var/task", "node_modules", "@anthropic-ai", "claude-agent-sdk-linux-x64", "claude"),
  ];

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    return NextResponse.json({
      error: "binario no encontrado",
      candidates,
      cwd: process.cwd(),
      platform: process.platform,
      arch: process.arch,
    });
  }

  // Intento: spawn en modo non-interactive con prompt simple
  const printResult = await runBinary(
    found,
    ["-p", "--output-format", "json", "decime hola en una palabra"],
    { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    30000,
  );

  // Intento: con --bare (modo minimal para entornos no estandar)
  const bareResult = await runBinary(
    found,
    ["--bare", "-p", "--output-format", "json", "decime hola en una palabra"],
    { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    30000,
  );

  return NextResponse.json({
    binary: found,
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
    env_has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    env_path: process.env.PATH,
    printResult,
    bareResult,
  });
}

async function runBinary(
  bin: string,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  timeoutMs = 15000,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string | null;
  durationMs: number;
}> {
  const start = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let resolved = false;
    const env = { ...process.env, ...extraEnv } as NodeJS.ProcessEnv;
    const child = spawn(bin, args, { timeout: timeoutMs, env });
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({
        stdout: stdout.slice(0, 4000),
        stderr: stderr.slice(0, 4000),
        exitCode: null,
        error: err.message,
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      resolve({
        stdout: stdout.slice(0, 4000),
        stderr: stderr.slice(0, 4000),
        exitCode: code,
        error: null,
        durationMs: Date.now() - start,
      });
    });
  });
}
