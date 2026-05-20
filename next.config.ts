import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Claude Agent SDK incluye un binario nativo y dependencias que no deben
  // ser bundleadas por el compilador de Next: se marcan como externas para
  // que se carguen desde node_modules en runtime (server-side).
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
  ],
  // Los prompts del agente son archivos .md que se leen en runtime. Hay que
  // incluirlos explicitamente en el output tracing para que viajen al deploy
  // serverless (si no, no estarian disponibles en produccion).
  outputFileTracingIncludes: {
    "/api/**": ["./src/lib/agent/prompts/**/*.md"],
  },
};

export default nextConfig;
