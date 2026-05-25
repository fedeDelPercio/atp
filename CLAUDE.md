# ATP — Panel design system

Cuando construyas o modifiques cualquier UI en este repo, seguí estas reglas. La
estética es **refined minimal**: paleta neutra, jerarquía por tipografía y
espacio, sin "AI slop". Si una pantalla ya existe pero no cumple esto, alinearla
es parte del trabajo, no scope creep.

## Principios

- Dark mode es el modo por defecto. Soportar light también, ambos se prueban.
- Paleta neutra. **No usamos** violeta, índigo, azul saturado, rosa fuerte,
  teal, ni gradientes vistosos. El color queda para tres usos: acentos
  semánticos (ok/warn/destructivo) como texto o ícono, puntitos de estado,
  y nada más. Jamás como fondo de bloque.
- Tipografía afilada: Geist Sans para UI, Geist Mono para contadores, códigos,
  timestamps. Tracking apretado (`tracking-tight-er`, -0.015em) en títulos y
  números.
- Movimiento contenido. Solo `transition` sutil en hover/focus. No bounce, no
  efectos decorativos, no shimmer.
- Componentes chicos, padding ajustado. Evitar contenedores "card" pesados
  alrededor de bloques de texto.

## Paleta

| Uso | Light | Dark |
|---|---|---|
| App bg | white | neutral-950 |
| Surface (modal, popover, burbuja agente) | white | neutral-900 |
| Surface sutil (item hover, panel interno) | neutral-50 | neutral-900/60 |
| Border default | neutral-200 | neutral-800 |
| Border hover | neutral-300 | neutral-700 |
| Border focus | neutral-400 | neutral-600 |
| Texto primario | neutral-900 | neutral-50 |
| Texto secundario | neutral-500 | neutral-400 |
| Texto muted (timestamps, contadores) | neutral-400 | neutral-500 |
| Botón primario bg | neutral-900 | neutral-50 |
| Botón primario fg | white | neutral-950 |

**Acentos semánticos** (definidos en `tailwind.config.ts`):
- `ok` (emerald) — estados positivos. Como texto o dot.
- `warn` (amber) — sistema, banners informativos. Como texto o ícono pequeño.
- `red-600`/`red-700` — acciones destructivas (botón confirm destructivo).
  **NO usar `rose-*`** para destructivo: el rosa lee como pinky, no como
  "elegante destructivo".

**Nunca** usar como fondo de bloque grande: amber-50/100, rose-50/100,
emerald-50/100, blue-*, violet-*, indigo-*. Si querés señalizar un estado en
un banner/pill, usá fondo neutral con el acento solo en el ícono.

## Tipografía (clases exactas)

| Rol | Clase |
|---|---|
| Título de modal / sección | `text-[15px] font-medium tracking-tight-er` |
| Item label (lista, header de columna) | `text-[13px] font-medium` |
| Body / descripción | `text-[12px] leading-relaxed text-neutral-500` |
| Label de campo | `text-[11.5px] font-medium text-neutral-700 dark:text-neutral-300` |
| Help text bajo input | `text-[11px] text-neutral-500 dark:text-neutral-500` |
| Placeholder | `placeholder:text-neutral-400 dark:placeholder:text-neutral-500` |
| Timestamp / contador / código | `font-mono text-[10.5px] uppercase tracking-wide text-neutral-400` |
| Botón label | `text-[13px] font-medium` |
| Pill / banner microcopy | `text-[11.5px] tracking-tight-er` |

No usar `font-semibold` (queda muy pesado). `font-medium` es el techo en UI.
No usar `text-base`/`text-sm`/`text-lg` arbitrarios: pedile a la tabla de
arriba la pixelada exacta.

## Border radius

- `rounded-lg` — solo superficies grandes de modal (`<div class="... p-5">`).
- `rounded-md` — botones, inputs, list items, popovers, cards internas. Default.
- `rounded-sm` — celdas de calendario, controles muy compactos.
- `rounded-full` — avatares y dots de estado, nada más.
- **NO** `rounded-xl`, `rounded-2xl`, ni `rounded-3xl`.

## Espaciado

- Modal: `p-5`, `max-w-sm` (confirm/simple) o `max-w-md` (forms más densos).
- Input: `px-3 py-2`.
- Botón: `px-3 py-2` (secundario) / `px-3.5 py-2` (primario / destructivo).
- Gap ícono inline + texto: `gap-1.5` (tight) o `gap-2` (default).
- Transición entre campos del form: `mt-3` o `mt-4`.
- Transición de bloque (header → form, form → CTA): `mt-5`.

## Componentes (snippets canónicos)

### Modal envoltorio

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm"
  onClick={onClose}
>
  <div
    className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-soft-dark"
    onClick={(e) => e.stopPropagation()}
  >
    {/* contenido */}
  </div>
</div>
```

ESC también cierra (listener en `keydown`). Click fuera siempre cierra (salvo
durante un async destructivo: usar `loading` para suprimir).

### Botón primario

```tsx
className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
```

### Botón secundario / ghost

```tsx
className="rounded-md px-3 py-2 text-[13px] text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-300 dark:hover:bg-neutral-800"
```

### Botón destructivo

Mismo shape que primario, cambia el color. **Red, no Rose**:

```tsx
className="flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
```

### Input de texto

```tsx
className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
```

**Evitar** `<input type="datetime-local">`, `<input type="date">`,
`<input type="time">`, `<input type="color">`: los pickers nativos traen
colores de OS (azul Windows, naranja iOS) que rompen la estética. Construir
popover propio (ver `DateTimeField` en iBath como referencia).

### Banner de sistema dentro de la conversación

Discreto, no card amarilla. Pill neutra con ícono pequeño de acento:

```tsx
<div className="flex justify-center py-3">
  <div className="flex max-w-[92%] items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11.5px] tracking-tight-er text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
    <Bell className="h-3 w-3 shrink-0 text-warn" strokeWidth={1.75} />
    <span>{message.content}</span>
  </div>
</div>
```

El **contenido** del banner: oración corta, mayúscula inicial, sin emoji, sin
em dash, sin period final, sin caps lock. Ejemplo bueno:
`Derivado al equipo: Cliente existente`. Ejemplo malo:
`🔔 NOTIFICACIÓN AL EQUIPO — Cliente existente. La conversación fue derivada.`

### Iconos

- Todos via `lucide-react`.
- `strokeWidth={1.75}` por defecto. `2` solo en botones chiquititos.
- Tamaños: `h-3 w-3` (en pills/banners), `h-3.5 w-3.5` (la mayoría de botones),
  `h-4 w-4` (header de modal), `h-5 w-5` muy puntual.
- **Nunca emoji como ícono** (🔔, 🚀, ⚠, ✅): usar lucide.

## Microcopy

- Sentence case en títulos: "Nueva conversación", no "Nueva Conversación".
- Español rioplatense (vos, te), neutral, sin marketing.
- Sin emojis en labels estáticos.
- Sin em dash (`—`): usar coma, punto, o `·` (middle dot) como separador.
- Sin `¿` ni `¡` (microcopy de panel suena más limpio sin signo de apertura).
- No exclamación múltiple. Una o ninguna.

## Reglas del agente (cuando edites prompts de Santino / Mica)

Estas reglas son del producto, no del panel, pero como vivimos en el mismo
repo: agentes WhatsApp/Instagram **nunca** usan emojis, **nunca** doble
asterisco para negritas (`**bold**` se ve literal en WA), **nunca** terminan
con punto, **nunca** abren con `¿`/`¡`, **nunca** usan em dash, y **nunca**
declaran que son IA / bot / asistente virtual.

El evaluator del agente bloquea estas violaciones; si vas a tocar reglas de
formato en `orchestrator.md`, asegurate de que el criterio bloqueante en
`evaluator.md` siga alineado.

## Anti-patrones (lo que NO mandamos a prod)

- Fondos violet/indigo/blue gradients, "purple gradient on white" en general.
- Cards `rounded-xl` con border grueso alrededor de cada item de lista.
- Emoji en títulos o labels (🚀 Nueva, 🎉 Listo).
- Banners all-caps con ícono + emoji + em dash.
- Botón destructivo en `rose-600` (queda muy pinky); usar `red-600`.
- Múltiples colores de acento compitiendo en la misma pantalla.
- Placeholder genérico tipo "Type your message here...".
- `text-base` para títulos chicos: usar la escala de pixeles exacta.
- Doble ícono (Bell component + 🔔 en el texto): elegir uno.

## Estilo de trabajo del repo (Federico)

- Avanzar de corrido, no pedir checkpoints por archivo. Si la decisión es
  razonable, tomala y seguí.
- UI y comentarios en español neutro (con voseo en copy de agentes).
  Identificadores en inglés.
- No agregar features ni refactors fuera del scope pedido.
- Antes de pushear a producción confirmá explícito (los pushes son visibles).
  Excepción: si la tarea de antemano implicaba "deploy/probá en prod", ahí
  va sin checkpoint extra.
- Para mergear `main → client/*`: **NO** `git merge origin/main` directo,
  borra los prompts. Usar checkout selectivo por path. Ver memoria
  `feedback_merge_to_client_branches.md` para el detalle.
