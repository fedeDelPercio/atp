import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Claude Agent SDK incluye un binario nativo y dependencias que no deben
  // ser bundleadas por el compilador de Next: se marcan como externas para
  // que se carguen desde node_modules en runtime (server-side).
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@anthropic-ai/claude-agent-sdk-linux-x64",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
  ],
  // Los prompts del agente son archivos .md que se leen en runtime. Hay que
  // incluirlos explicitamente en el output tracing para que viajen al deploy
  // serverless (si no, no estarian disponibles en produccion).
  //
  // El binario nativo del SDK (linux-x64) se instala via vercel.json
  // installCommand pero Next no lo detecta solo (el SDK lo carga dinamicamente).
  // Por eso lo agregamos a mano al tracing.
  outputFileTracingIncludes: {
    "/api/**": [
      "./src/lib/agent/prompts/**/*.md",
      "./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**",
    ],
  },
};

export default nextConfig;
