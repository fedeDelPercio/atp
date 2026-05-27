-- ===========================================================================
-- Acumulador de mensajes con debounce de 20s.
--
-- Cuando un usuario manda varios mensajes seguidos (estilo WhatsApp: "hola"
-- + "te queria preguntar" + "cuanto sale el ceibo?"), el agente los procesa
-- como uno solo en vez de responder 3 veces. La logica de la app extiende
-- el `process_at` del job pending cada vez que llega un mensaje nuevo
-- dentro de la ventana; el worker solo procesa jobs cuyo `process_at` ya
-- esta vencido.
--
-- Default 'now()' = sin debounce: el job se procesa apenas el worker lo
-- vea. La app va a setear `process_at = now() + 20s` desde el webhook
-- entrante.
-- ===========================================================================

alter table agent_jobs
  add column process_at timestamptz not null default now();

create index agent_jobs_pending_process_idx
  on agent_jobs (client_slug, status, process_at)
  where status = 'pending';

-- Actualizar claim_agent_jobs para que solo reclame jobs ya vencidos.
create or replace function claim_agent_jobs(p_limit int)
returns setof agent_jobs
language sql
as $$
  update agent_jobs
  set status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  where id in (
    select id from agent_jobs
    where status = 'pending'
      and process_at <= now()
    order by process_at
    for update skip locked
    limit p_limit
  )
  returning *;
$$;
