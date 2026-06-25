-- ===========================================================================
-- 013_claim_jobs_respect_process_at.sql — debounce-ready claim_agent_jobs.
--
-- Antes el RPC reclamaba jobs en estado 'pending' sin importar process_at,
-- entonces un job recién creado se procesaba inmediatamente. Para el flow
-- de WhatsApp via Kommo necesitamos debounce: encolar un job con
-- process_at = now() + DEBOUNCE_MS y darle tiempo a que llegue otro mensaje
-- antes de procesar (acumulación).
--
-- Si llega otro mensaje del lead antes del timer, el endpoint UPDATE
-- process_at = now() + DEBOUNCE_MS sobre el job existente (reset).
-- ===========================================================================

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
    order by process_at, created_at
    for update skip locked
    limit p_limit
  )
  returning *;
$$;
