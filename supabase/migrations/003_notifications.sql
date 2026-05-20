-- ===========================================================================
-- Notificaciones al equipo de ventas (agente IBATH).
--
-- Cada vez que el agente detecta un disparador (interes de compra, consulta
-- por cantidad, arquitecto/desarrollador, cliente existente, consulta fuera
-- de la base de conocimiento) registra una notificacion. La conversacion
-- queda "congelada": el agente no responde mas y el vendedor toma el control.
-- ===========================================================================

create table agent_notifications (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  trace_id uuid references agent_traces(id) on delete set null,
  category text check (category in (
    'arquitecto_desarrollador',
    'cantidad_equipos',
    'interes_compra',
    'cliente_existente',
    'fuera_de_conocimiento'
  )) not null,
  reason text,
  summary text,
  created_at timestamptz not null default now()
);
create index on agent_notifications(conversation_id, created_at desc);

alter publication supabase_realtime add table agent_notifications;
