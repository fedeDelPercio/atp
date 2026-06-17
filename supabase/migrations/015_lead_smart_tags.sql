-- ===========================================================================
-- 015_lead_smart_tags.sql
--
-- Suma 3 columnas a la tabla `leads` para clasificacion automatica:
--
--  1) `smart_tag`     — categoria cualitativa (que pasa con el lead):
--     'curioso', 'busca_a_estrenar', 'interes_otras_opciones', 'interesado'.
--
--  2) `temperatura`   — prioridad para el equipo:
--     'frio', 'tibio', 'caliente'.
--
--     Se deriva del smart_tag + senales de la conversacion. Reglas:
--      - smart_tag in (curioso, busca_a_estrenar, interes_otras_opciones)
--        → frio (no compra ESTE desarrollo).
--      - smart_tag = interesado + acepto llamada / pidio asesor → caliente.
--      - smart_tag = interesado + 2+ msgs del lead → tibio.
--
--  3) `smart_tag_manual` — boolean. Si el operador edita smart_tag o
--     temperatura desde el modal, este flag pasa a true y la recomputacion
--     automatica (cada vez que llega un msg) NO sobrescribe.
--
-- Los valores se computan en codigo (no via trigger) para mantener la
-- logica cerca del runtime del agente, donde ya tenemos contexto.
-- ===========================================================================

alter table leads
  add column if not exists smart_tag text,
  add column if not exists temperatura text,
  add column if not exists smart_tag_manual boolean not null default false;

alter table leads drop constraint if exists leads_smart_tag_check;
alter table leads add constraint leads_smart_tag_check
  check (smart_tag is null or smart_tag in (
    'curioso',
    'busca_a_estrenar',
    'interes_otras_opciones',
    'interesado'
  ));

alter table leads drop constraint if exists leads_temperatura_check;
alter table leads add constraint leads_temperatura_check
  check (temperatura is null or temperatura in (
    'frio',
    'tibio',
    'caliente'
  ));

comment on column leads.smart_tag is
  'Clasificacion cualitativa: curioso / busca_a_estrenar / interes_otras_opciones / interesado. Auto-computed salvo que smart_tag_manual=true.';
comment on column leads.temperatura is
  'Prioridad: frio / tibio / caliente. Derivado del smart_tag + actividad del lead.';
comment on column leads.smart_tag_manual is
  'Si el operador editó smart_tag o temperatura desde el panel, la recomputacion automatica los respeta.';
