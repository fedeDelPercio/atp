-- ===========================================================================
-- Leads: contactos calificados que esperan ser atendidos por un asesor humano.
--
-- Se crean / actualizan automaticamente desde la app cuando el agente
-- dispara `notify_team` con una categoria que califica como lead
-- (interes_compra, arquitecto_desarrollador, cantidad_equipos,
-- cliente_existente no-tecnico, segun decida cada cliente).
--
-- Idempotencia: upsert por `conversation_id`. Cada conversacion tiene a
-- lo sumo un lead asociado; si el agente notifica varias veces, se
-- actualiza el lead existente en vez de crear duplicados.
--
-- Estados: nuevo -> contactado -> (cerrado | descartado). Quien lo toma
-- queda registrado en `contacted_by` (FK a profiles).
-- ===========================================================================

create table leads (
  id uuid primary key default gen_random_uuid(),
  client_slug text not null default current_client_slug(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  phone text,
  name text,
  email text,
  interest_category text not null,
  status text not null default 'nuevo'
    check (status in ('nuevo', 'contactado', 'descartado', 'cerrado')),
  notes text,
  contacted_by uuid references profiles(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  -- Una conversacion = a lo sumo un lead. Habilita upsert by conversation_id.
  constraint leads_conversation_id_unique unique (conversation_id)
);

create index on leads (client_slug, status, created_at desc);
create index on leads (client_slug, interest_category, created_at desc);
create index on leads (client_slug, phone) where phone is not null;

alter table leads enable row level security;

create policy tenant_isolation on leads
  for all to anon, authenticated
  using (client_slug = current_client_slug())
  with check (client_slug = current_client_slug());

-- Realtime: el panel se entera de leads nuevos / cambios de estado sin
-- recargar.
alter publication supabase_realtime add table leads;
