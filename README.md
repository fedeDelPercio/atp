# Agentic Testing Panel

Plataforma web para **testear agentes de IA** construidos sobre el patrón
**orquestador + subagentes + evaluator**, antes de conectarlos a producción.

Fase 1: el agente se prueba desde el panel mismo (conversaciones simuladas).
Fase 2 (futura): se enchufa WhatsApp sin reescribir el agente.

## Qué hace

- Crear **conversaciones de prueba** en paralelo (cada una simula un cliente).
- Conversar con el agente desde el panel.
- Ver el **detalle agéntico** (subagentes, evaluator, tokens, latencia) con
  toggle entre vista simple y avanzada.
- Dejar **comentarios firmados por perfil** sobre mensajes o conversaciones.
- Configurar **webhooks salientes** ante eventos del agente.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript estricto.
- **Tailwind CSS 3.4** (componentes propios, sin librería de UI).
- **`@anthropic-ai/claude-agent-sdk`** — base del sistema agéntico.
- **`@supabase/supabase-js` + `@supabase/ssr`** — Postgres + Realtime.
- **zod** (validación), **lucide-react** (iconos), **date-fns**,
  **react-hot-toast**.

## Arquitectura

### Webhook-first

El panel **no llama al agente directamente**. El flujo es:

```
Composer del panel
   │  POST /api/webhooks/incoming   (igual que hará Meta en fase 2)
   ▼
Inserta el mensaje + encola un job (agent_jobs)  → 200 OK inmediato
   │
   ▼
Worker /api/jobs/process  (cron de Vercel cada minuto + auto-trigger local)
   │  reclama jobs · corre el agente · persiste la respuesta
   ▼
Supabase Realtime  → el panel ve aparecer la respuesta sin recargar
```

### Sistema agéntico (Claude Agent SDK)

- **Orquestador** ([src/lib/agent/orchestrator.ts](src/lib/agent/orchestrator.ts)):
  sesión del Agent SDK con el system prompt, los subagentes y las tools
  del panel. Única tool built-in habilitada: `Agent` (para invocar
  subagentes). Sin acceso a Bash/Read/Write.
- **Subagentes** ([src/lib/agent/subagents/](src/lib/agent/subagents/)):
  `AgentDefinition` del SDK, con contexto aislado. Hoy hay un placeholder
  (`example_subagent`).
- **Evaluator** ([src/lib/agent/evaluator.ts](src/lib/agent/evaluator.ts)):
  sesión separada que audita la respuesta contra el rubric y devuelve un
  veredicto JSON.
- **Loop de reintentos** ([src/lib/agent/run.ts](src/lib/agent/run.ts)):
  orquestador → evaluator → si rechaza, reintenta con feedback (hasta
  `AGENT_MAX_ITERATIONS`). Si se agota, escala.
- **Tool `notify_team`**: disponible desde el primer turno para entregar la
  conversación a un humano cuando se detecta un disparador. La categoría es
  texto libre (snake_case): cada cliente define las suyas en su prompt.
- **Trace**: cada corrida registra un `agent_traces` + N `agent_trace_steps`
  (un step por orquestador / subagente / tool / evaluator).

## Estructura multi-cliente (branch-per-client + tenant en una sola DB)

Este repo está pensado como **base reutilizable**:

- `main` = panel + template de agente con placeholders. **Acá viven las
  mejoras del panel** (UI, infra, bug fixes).
- `client/<nombre>` = una rama por cliente. Cada rama customiza solo
  [src/lib/agent/](src/lib/agent/) (prompts, KB, categorías de notificación,
  horario, rubric) y deploya a su propio Vercel.
- Cuando hay una mejora del panel: commit en `main` → `git merge main` en
  cada rama de cliente. Sin drift entre clientes.

### Aislamiento de datos: RLS + `client_slug`

Para no pagar un proyecto Supabase por cliente, todos comparten **un solo
proyecto** y los datos se aíslan a nivel de DB:

- Cada tabla tiene una columna `client_slug` (snake_case, ej: `ibath`).
- Postgres tiene **Row Level Security** activado en todas las tablas con
  policies que filtran por el slug que viene en el header HTTP
  `X-Client-Slug` de cada request.
- El cliente supabase-js de cada worktree setea el header automáticamente
  leyéndolo de la env var `NEXT_PUBLIC_CLIENT_SLUG`.
- Cualquier query (con o sin WHERE) solo ve filas del cliente activo. Si
  una query se olvida el filtro, devuelve 0 filas. No hay forma de que un
  bug mezcle datos entre clientes.

Ver [supabase/migrations/004_multi_client.sql](supabase/migrations/004_multi_client.sql)
para el detalle.

### Worktrees

Para trabajar con varias ramas en paralelo localmente, usá **`git worktree`**
(cada cliente abre en su propia carpeta con su propio `.env.local`):

```bash
git worktree add ../atp-<cliente> client/<cliente>
```

Cada worktree corre su `npm run dev` en un puerto distinto (configurado en
su `package.json`) y tiene su propio `NEXT_PUBLIC_CLIENT_SLUG` en
`.env.local`.

## Cómo empezar (setup local)

### 1. Requisitos

- Node.js >= 20.9
- Una cuenta de Supabase y una API key de Anthropic.

### 2. Base de datos (Supabase)

Si es el primer cliente que enchufás: creá un proyecto Supabase y aplicá en
orden las migraciones de [supabase/migrations/](supabase/migrations/):
`001_initial.sql`, `002_claim_jobs.sql`, `003_notifications.sql`,
`004_multi_client.sql`.

Si ya hay un proyecto Supabase compartido entre varios clientes: no creés
uno nuevo. El aislamiento lo hace RLS via `client_slug` (ver sección
"Aislamiento de datos" más arriba). Elegí un slug snake_case único para
este cliente y poneselo en `NEXT_PUBLIC_CLIENT_SLUG`.

### 3. Variables de entorno

Copiá `.env.example` a `.env.local` y completá con los datos del proyecto
Supabase recién creado y tu API key de Anthropic:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project
  Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role`
  (secret).
- `ANTHROPIC_API_KEY` — https://console.anthropic.com/
- `CRON_SECRET`, `WEBHOOK_SIGNING_SECRET` — generá dos strings random
  (ej: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).

### 4. Instalar y levantar

```bash
npm install
npm run dev
```

Abrí http://localhost:3000

### 5. Primer uso

1. Aparece el modal **"¿Quién sos?"** → creá un perfil (elegí role **Dev**
   para ver el tab Webhooks y el panel de debugging).
2. En **Conversaciones**, click en **"+ Nueva conversación de prueba"** y
   poné un nombre (ej: `Juan - busca 2 amb`).
3. Escribí un mensaje en el composer y enviá.
4. Aparece **"Agente pensando…"**; el worker corre el agente y la respuesta
   aparece sola (Realtime).
5. Cambiá a **Vista avanzada** y expandí el mensaje del agente para ver el
   trace (steps, tokens, latencia).

> En local no corre el cron de Vercel. El worker se dispara solo
> (auto-trigger tras cada mensaje). Si algo queda en cola, usá el botón
> **"Procesar ahora"** del panel flotante (visible para perfiles dev).

> Con los prompts vacíos el agente responde algo genérico y el evaluator
> aprueba casi todo: el objetivo de fase 1 es validar que la **infra**
> funciona end-to-end, no que el agente sea inteligente todavía.

## Cómo personalizar el agente

Todo lo editable vive en [src/lib/agent/](src/lib/agent/):

- **Prompts** → [src/lib/agent/prompts/](src/lib/agent/prompts/): editá los
  `.md` (`orchestrator.md`, `evaluator.md`, `example_subagent.md`). Son el
  source of truth del comportamiento.
- **Agregar un subagente**: creá un archivo en
  [src/lib/agent/subagents/](src/lib/agent/subagents/) con su
  `AgentDefinition`, un `.md` de prompt, y registralo en
  `subagents/index.ts` (`buildAgentsMap`).
- **Agregar una tool**: creá un archivo en
  [src/lib/agent/tools/](src/lib/agent/tools/) con `tool(...)` y sumala al
  array de `tools/index.ts` (`buildPanelToolServer`).
- **Criterios del evaluator**: editá `evaluator.md` (descripciones) y
  mantené alineada la lista de [src/lib/agent/rubric.ts](src/lib/agent/rubric.ts).
- **Modelos**: variables `ANTHROPIC_MODEL_*` en `.env.local`.

Tras cambiar el schema de la DB, regenerá los tipos: pedíselo a Claude Code
(usa el MCP de Supabase) o corré el CLI de Supabase, y actualizá
[src/lib/supabase/types.ts](src/lib/supabase/types.ts).

## Deploy a Vercel (manual)

1. Subí el repo a GitHub.
2. En Vercel, **New Project** → importá el repo.
3. Cargá todas las variables de entorno de `.env.local` en Vercel
   (Project Settings → Environment Variables). Para `NEXT_PUBLIC_APP_URL`
   usá la URL del deploy.
4. El cron del worker ya está en [vercel.json](vercel.json)
   (`/api/jobs/process` cada minuto). Vercel autentica el cron con el
   header `Authorization: Bearer $CRON_SECRET`.
5. Deploy. La región de Supabase usada es `sa-east-1`; conviene desplegar
   en una región de Vercel cercana.

## Roadmap de Fase 2

- **WhatsApp Business API**: el webhook entrante ya existe; sumar el
  endpoint de verificación de Meta y el parseo de su payload.
- **`WhatsAppProvider`**: implementar `MessagingProvider`
  ([src/lib/providers/](src/lib/providers/)) con `sendMessage` que pegue al
  Graph API. No requiere tocar el agente.
- **Dashboard de métricas**: con los datos de `agent_traces` /
  `agent_trace_steps`. Recomendado: **Tremor Blocks** (MIT, gratis,
  copy-paste de https://blocks.tremor.so/).
- **Fallback Anthropic → OpenRouter**: capa de modo degradado si Anthropic
  satura (diferido en fase 1).
- **Supabase Auth + RLS**: login real y Row Level Security.
- **Editor de prompts en la UI**.
- **Tests automatizados**.
- **Multi-tenancy** si se vende a varios clientes.

## Deuda técnica conocida

- **Sin RLS / sin auth real**: los perfiles son solo nombres en
  localStorage. Las tablas quedan expuestas con la anon key. Además el
  proyecto Supabase es compartido con otras apps.
- **Sin moderación de comentarios**: cualquier perfil puede borrar
  cualquier comentario.
- **Sin verificación HMAC de webhooks entrantes**: `/api/webhooks/incoming`
  no valida firma (sí se firman los salientes).
- **Sin rate limiting** en los endpoints.
- **Sin idempotencia por `external_message_id`**: un mismo mensaje entrante
  reenviado se procesa dos veces.
- **Fallback OpenRouter no implementado** (diferido a fase 2).
- **Sin tests automatizados**: el testing de fase 1 es manual desde el panel.
- **Tokens por subagente/tool en 0**: el trace-logger no puede atribuir
  tokens por step; el total del trace sí es correcto.
- **Escalado al deployar**: el Agent SDK levanta un subproceso. A escala
  sostenida, conviene mover el worker (`/api/jobs/process`) a un servicio
  long-running dedicado (contenedor) en lugar del cron de Vercel. La
  arquitectura webhook-first hace que sea un cambio aislado.

## Mejoras pendientes (fuera de scope de fase 1)

- Columnas de costo en USD en `agent_traces` / `agent_trace_steps`
  (el Agent SDK ya expone `total_cost_usd`).
- Dark mode (Tailwind ya está configurado con `darkMode: "class"`).
- Paginación real del historial de mensajes.
- Reintento automático ante fallos transitorios del agente.

## Estructura

```
src/
  app/
    (dashboard)/         layout con gate de perfil + tabs
      conversations/     tab Conversaciones
      webhooks/          tab Webhooks (solo dev)
    api/                 webhook entrante, worker, CRUD
  components/            UI del panel
  lib/
    agent/               orquestador, evaluator, subagentes, tools, hooks
    providers/           MessagingProvider (test / whatsapp)
    supabase/            clientes y tipos
    webhooks/            dispatcher de webhooks salientes
supabase/migrations/     DDL
```
