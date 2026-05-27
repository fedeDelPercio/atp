-- ===========================================================================
-- Extensiones a la tabla leads.
--
-- 1) `unit_typology`: campo libre opcional con la tipología que el lead
--    consultó (ej. "A", "B - monoambiente", "2 ambientes piso 4"). Por ahora
--    se llena manualmente desde el panel; mas adelante podemos hacer que el
--    agente lo capture via tool y lo setee automatico.
--
-- 2) `call_notes`: observaciones libres del vendedor sobre la(s) llamada(s)
--    con el lead. Texto largo, multilinea.
--
-- 3) Estados adicionales: sumamos `no_atendio`, `recontactar` y
--    `dar_seguimiento` al check constraint. Estados ya existentes se
--    mantienen.
-- ===========================================================================

alter table leads
  add column unit_typology text,
  add column call_notes text;

-- Reemplazar el check constraint para sumar los 3 estados nuevos. Postgres
-- no soporta `alter constraint check`, asi que drop + add.
alter table leads drop constraint leads_status_check;
alter table leads add constraint leads_status_check
  check (status in (
    'nuevo',
    'contactado',
    'no_atendio',
    'recontactar',
    'dar_seguimiento',
    'descartado',
    'cerrado'
  ));
