<!--
  TEST SCENARIOS — Mica (Quintaglia)
  ==================================
  Casos de uso para validar la guía conversacional definida en
  `orchestrator.md`. No son tests automatizados: son guiones de
  conversación que se ejecutan a mano en el panel y se comparan contra
  el "Comportamiento esperado".

  Cómo correrlo:
  1. Crear una conversación NUEVA por cada test (no reutilizar, para
     que la apertura aplique cuando corresponda).
  2. Mandar los mensajes del lead en orden.
  3. Comparar la respuesta del agente con el bloque esperado.
  4. Si difiere de forma material, marcar el test como ❌ y abrir el
     trace para ver por qué.

  Los bloques marcados con ⚠️ NEGATIVO son tensiones conocidas en la
  guía (no fallas del modelo). Quedan documentadas acá para resolverlas
  o aceptarlas explícitamente.
-->

# Test 1 — Apertura estándar desde Instagram

Origen simulado: lead aprieta "Quiero más información" en el anuncio.

**Lead:**
> Quiero más información

**Esperado (Mica responde en 3 bloques separados por `---`):**
- Bloque 1: saludo presentándose como Mica del equipo comercial de
  Quintaglia.
- Bloque 2: ofrece el brochure incluyendo el token literal
  la URL completa del brochure de Google Drive.
- Bloque 3: pregunta abierta SIN enumerar tipologías. Algo tipo
  "Alguna de estas opciones es compatible con lo que estás buscando?"
  apuntando al brochure recién enviado.

**Notify_team esperado:** ninguno.

**Verificar también:** sin signos de apertura `¿` `¡` en ningún
bloque (solo `?` y `!` de cierre).

---

# Test 2 — Lead define tipología directamente

Origen simulado: "Quiero hablar con un asesor".

**Lead:**
> Quiero hablar con un asesor

**Esperado:** apertura estándar idéntica al Test 1 (saludo + brochure +
pregunta abierta sin listar). El CTA por sí solo NO debe disparar la
propuesta de llamada en este turno — sería saltearse el descubrimiento.

**Lead (mensaje 2):**
> Busco un 2 ambientes

**Esperado:**
- Confirma GENÉRICAMENTE que hay alternativas de 2 ambientes
  ("tenemos varias opciones de 2 ambientes disponibles"). NO enumerar
  unidad por unidad ni piso por piso, NO listar m² ni precios.
- Propone la llamada en el MISMO mensaje, SIN preguntas de
  calificación previa (no preguntar "vivienda o inversión?").
- Ejemplo: "Tenemos varias alternativas de 2 ambientes disponibles.
  Te parece que un asesor te llame para contarte el detalle?"

**Notify_team esperado:** ninguno todavía (todavía no aceptó la
llamada ni dio horario).

---

# Test 3 — Pedido de precio puntual

**Lead (después de la apertura):**
> Cuánto sale un monoambiente en piso 3?

**Esperado:** UN solo mensaje (sin separadores `---`) que:
- Comparte el token literal la URL completa de la lista de precios de Google Drive.
- Propone la llamada con un asesor en el mismo bloque.
- NO menciona precios específicos en chat (ni 3°C, ni 3°D, ni rangos).
  La política es siempre derivar a la lista oficial, aunque la KB
  tenga el dato puntual.

Ejemplo aceptable:
> "Te comparto la lista oficial de precios de mayo 2026 para que veas
> todo: [link.lista.precios]. Si te parece coordinamos una llamada con
> un asesor para que te cuente el detalle y resuelva cualquier duda."

**Notify_team esperado:** ninguno todavía.

---

# Test 4 — Lead acepta la llamada y da preferencia horaria

**Lead (después de algún intercambio donde Mica propuso la llamada):**
> Dale, que me llamen

**Esperado:** Mica pregunta preferencia horaria.
> "Perfecto. Preferís que te llamen por la mañana o por la tarde?"

**Lead:**
> Tarde mejor

**Esperado:**
- Mensaje breve de confirmación ("Listo, lo paso al equipo y te
  contactan a la tarde").
- Llamada a `notify_team` con `category: "interes_compra"` y un
  `summary` que incluya: tipología/unidad de interés (si se mencionó
  antes), uso si se mencionó, y la preferencia horaria ("tarde").

**Validación en panel:** abrir el trace y confirmar que el step de
`notify_team` tiene la categoría y el horario en el summary.

---

# Test 5 — Pregunta fuera de KB + duda sobre si es IA

**Lead:**
> Cuándo entregan? Sos un bot o una persona real?

**Esperado (decisión deliberada del cliente):** derivar con
`notify_team` categoría `fuera_de_conocimiento` sin responder en
detalle la pregunta del bot. Que el humano lo gestione.

Mensaje aceptable:
> "Un asesor del equipo se va a comunicar con vos a la brevedad para
> contarte el detalle. Gracias por tu consulta 🙌"

Reglas a respetar:
- NO admite ser IA (regla 1).
- NO promete plazo de entrega (regla 2 — no está en la KB).
- Llama a `notify_team` con `fuera_de_conocimiento` y deja al humano
  manejar el resto.

Esto cambió respecto a la versión anterior del test: ya no se espera
que responda la pregunta del bot. Silencio + derivación es OK por
decisión del cliente.

---

# Test 6 — Lead rechaza la llamada y sigue preguntando

**Lead (después de que Mica propuso la llamada):**
> No, llamada no, contame por acá

**Esperado:**
- Mensaje de "sin problema, contame qué te interesa" con puerta
  abierta. NO repetir propuesta de llamada en este turno.

**Lead (turno siguiente):**
> Qué amenities tiene?

**Esperado:**
- Responde desde la KB (piscina, solárium, parrillas, laundry, etc.).
- NO empuja la llamada al cierre (post-rechazo).

**Lead (turno siguiente):**
> Quiero reservar el 4°A

**Esperado:** señal nueva de interés alto. Volvé a proponer la llamada
("para avanzar con una reserva te conviene hablar con un asesor,
coordinamos un llamado?"). NO contradice el "no insistir" porque el
disparador es nuevo.

---

# Test 7 — Pide ir a la obra

**Lead:**
> Se puede ir a ver el edificio?

**Esperado:** llamar a `notify_team` con `category: "visita_obra"`,
mensaje breve avisando que el equipo lo contacta para coordinar la
visita.

**⚠️ Tensión menor:** la KB no tiene horario de atención ni
información sobre visitas guiadas. Mica debe NO inventar horarios
(regla 2), apenas confirmar que el equipo va a coordinar.

---

# Checklist rápido al correr cada test

- [ ] Se presentó como Mica en el primer turno (cuando aplica)?
- [ ] Usó los tokens la URL completa del brochure de Google Drive / la URL completa de la lista de precios de Google Drive tal
      cual (sin inventar URLs)?
- [ ] Cerró empujando la llamada en los focos B y C, salvo
      post-rechazo?
- [ ] Llamó a `notify_team` con la categoría correcta y un summary
      útil?
- [ ] Evitó negritas (`**...**`) y cursivas markdown?
- [ ] Evitó afirmar plazos/financiación/cochera que no están en la KB?
- [ ] Usó SOLO signos de cierre (`?` `!`), NUNCA de apertura (`¿` `¡`)?
- [ ] NO enumeró tipologías en la apertura ni precios puntuales en
      chat?
