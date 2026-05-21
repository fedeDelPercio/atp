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
  `[link.brochure]`.
- Bloque 3: pregunta abierta listando las 4 tipologías (mono / 2 / 3 /
  4 ambientes).

**Notify_team esperado:** ninguno.

---

# Test 2 — Lead define tipología directamente

Origen simulado: "Quiero hablar con un asesor".

**Lead:**
> Quiero hablar con un asesor

**Esperado:** apertura completa (saludo + brochure + opciones), igual
que el Test 1. La apertura no cambia por el CTA; lo que cambia es la
velocidad con la que Mica propone la llamada en el turno siguiente.

**Lead (mensaje 2):**
> Busco un 2 ambientes

**Esperado:**
- Confirma desde la KB que hay alternativas de 2 ambientes
  disponibles (no enumerar piso por piso; sólo confirmar disponibilidad).
- Propone la llamada inmediatamente, SIN más preguntas de calificación.
- Ejemplo: *"Tenemos varias alternativas de 2 ambientes. ¿Te parece
  que un asesor te llame para contarte el detalle?"*

**Notify_team esperado:** ninguno todavía (todavía no aceptó la
llamada ni dio horario).

---

# Test 3 — Pedido de precio puntual + lista

**Lead (después de la apertura):**
> ¿Cuánto sale un monoambiente en piso 3?

**Esperado:**
- Da el precio de las unidades C y D del piso 3 desde la KB
  (3°C = USD 102.950, 3°D = USD 102.979), aclarando precio "lista".
  Puede mencionar el precio cash si está en la KB.
- En otro bloque o en el mismo, comparte la lista oficial con el token
  `[link.lista.precios]`.
- Cierra proponiendo la llamada con un asesor.

**Notify_team esperado:** ninguno todavía.

---

# Test 4 — Lead acepta la llamada y da preferencia horaria

**Lead (después de algún intercambio donde Mica propuso la llamada):**
> Dale, que me llamen

**Esperado:** Mica pregunta preferencia horaria.
> *"Perfecto. ¿Preferís que te llamen por la mañana o por la tarde?"*

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

# Test 5 — Pregunta fuera de KB + duda sobre si es IA  ⚠️ NEGATIVO

**Lead:**
> Cuándo entregan? Sos un bot o una persona real?

Acá hay dos consignas en un mismo mensaje, cada una toca una regla
distinta. El comportamiento esperado es:

1. **Plazo de entrega** → no está en la KB → derivar con
   `notify_team` categoría `fuera_de_conocimiento` en algún momento.
2. **"¿Sos un bot?"** → regla 1 absoluta: NO admitir IA. Redirigir
   amablemente al desarrollo. Si insistiera en mensajes siguientes,
   derivar con `escalado_manual`.

**⚠️ Tensión real (marcar como negativo):** la guía actual NO dice
explícitamente cómo manejar los dos en el mismo turno. Hay dos
caminos válidos:

- (a) Responder primero la pregunta de "¿sos un bot?" con redirección,
  y EN EL MISMO mensaje aclarar que el dato de plazo lo confirma con
  el equipo y los hace llamar.
- (b) Llamar a `notify_team` con `fuera_de_conocimiento` de una y
  pegar la respuesta de la regla 1 en el mensaje de despedida (pero
  esto deja al lead colgado en la pregunta "¿sos un bot?", lo cual es
  raro porque se está justo derivando).

Hoy esperamos que Mica elija (a). Si en la práctica elige (b) o
revela que es IA, hay que volver a tocar el prompt. Este test sirve
de canario para esa tensión.

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
¿coordinamos un llamado?"). NO contradice el "no insistir" porque el
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

- [ ] ¿Se presentó como Mica en el primer turno (cuando aplica)?
- [ ] ¿Usó los tokens `[link.brochure]` / `[link.lista.precios]`
      tal cual (sin inventar URLs)?
- [ ] ¿Cerró empujando la llamada en los focos B y C, salvo
      post-rechazo?
- [ ] ¿Llamó a `notify_team` con la categoría correcta y un summary
      útil?
- [ ] ¿Evitó negritas (`**...**`) y cursivas markdown?
- [ ] ¿Evitó afirmar plazos/financiación/cochera que no están en la
      KB?
