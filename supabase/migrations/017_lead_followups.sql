-- ===========================================================================
-- 017_lead_followups.sql
--
-- Sistema de seguimientos manuales al lead (a diferencia del follow-up
-- automatico de 014, que es un unico mensaje enviado al cliente).
--
-- Modela dos cosas:
--
-- 1) `follow_up_rules`: configuracion GLOBAL por temperatura. Cada regla
--    define cada cuanto disparar el proximo seguimiento (primera vez vs
--    periodica). Editable desde el modulo `/seguimientos`.
--
-- 2) `lead_followups`: una fila por INSTANCIA de seguimiento asociada a
--    un lead. Cada follow-up tiene una fecha objetivo (`due_at`) y se
--    marca como hecho registrando `completed_at`, `completed_by` y una
--    nota libre. Al marcarlo hecho, se crea automaticamente el siguiente
--    (con la periodica) mientras el lead no este cerrado.
--
-- Ciclo tipico:
--
--   status=contactado (por primera vez)
--     -> se crea lead_followups(kind='first',
--                               due_at = contacted_at + first_interval_days)
--   vendedor lo hace y escribe notas
--     -> completed_at + completed_by + notes
--     -> se crea el siguiente lead_followups(kind='recurring',
--                                            due_at = now() + recurring_interval_days)
--   status pasa a cerrado/descartado
--     -> los pendientes se filtran del pool (no borramos historial).
-- ===========================================================================

-- --- 1. follow_up_rules -----------------------------------------------------

create table if not exists follow_up_rules (
  client_slug text not null default current_client_slug(),
  temperatura text not null,
  first_interval_days integer not null default 3,
  recurring_interval_days integer not null default 7,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (client_slug, temperatura),
  constraint follow_up_rules_temp_check
    check (temperatura in ('frio', 'tibio', 'caliente')),
  constraint follow_up_rules_intervals_positive
    check (first_interval_days > 0 and recurring_interval_days > 0)
);

comment on table follow_up_rules is
  'Configuracion por-cliente y por-temperatura del ritmo de seguimientos manuales.';

alter table follow_up_rules enable row level security;

create policy tenant_isolation on follow_up_rules
  for all to anon, authenticated
  using (client_slug = current_client_slug())
  with check (client_slug = current_client_slug());

-- Seed defaults para Quintaglia. Idempotente via ON CONFLICT.
insert into follow_up_rules
  (client_slug, temperatura, first_interval_days, recurring_interval_days, enabled)
values
  ('quintaglia', 'caliente', 2, 5, true),
  ('quintaglia', 'tibio',    3, 7, true),
  ('quintaglia', 'frio',     7, 15, false)
on conflict (client_slug, temperatura) do nothing;

-- --- 2. lead_followups ------------------------------------------------------

create table if not exists lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  client_slug text not null default current_client_slug(),
  kind text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  constraint lead_followups_kind_check
    check (kind in ('first', 'recurring'))
);

comment on table lead_followups is
  'Historial + estado actual de los seguimientos manuales de un lead.';

comment on column lead_followups.due_at is
  'Cuando toca hacer este seguimiento. Si <= now() y completed_at IS NULL, esta vencido.';

comment on column lead_followups.kind is
  '"first" = primer seguimiento tras contactar. "recurring" = todos los siguientes.';

-- Indices:
--  - (lead_id, due_at desc): timeline en el modal del lead
--  - due_at parcial (solo pendientes) para la campanita
create index if not exists lead_followups_lead_due_idx
  on lead_followups (lead_id, due_at desc);

create index if not exists lead_followups_pending_due_idx
  on lead_followups (due_at)
  where completed_at is null;

create index if not exists lead_followups_client_slug_idx
  on lead_followups (client_slug);

alter table lead_followups enable row level security;

create policy tenant_isolation on lead_followups
  for all to anon, authenticated
  using (client_slug = current_client_slug())
  with check (client_slug = current_client_slug());
