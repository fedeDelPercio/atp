-- ===========================================================================
-- 016_followup_display_name.sql
--
-- Sumamos el `display_name` de la conversation al retorno de la RPC
-- find_followup_candidates para poder personalizar el copy del follow-up
-- ("Hola {nombre}!" cuando hay nombre, "Hola!" cuando no).
--
-- Es un cambio de signature de la RPC, no de datos. Reemplazamos la
-- version anterior (014_follow_ups.sql).
-- ===========================================================================

drop function if exists public.find_followup_candidates(integer, text[], text);

create or replace function public.find_followup_candidates(
  p_delay_ms integer,
  p_sources text[],
  p_client_slug text
)
returns table (
  conversation_id uuid,
  source text,
  external_id text,
  wa_jid text,
  display_name text,
  last_assistant_at timestamptz
)
language sql
stable
as $$
  with last_msg as (
    select distinct on (conversation_id)
      conversation_id,
      role,
      created_at
    from messages
    order by conversation_id, created_at desc
  )
  select
    c.id,
    c.source,
    c.external_id,
    c.wa_jid,
    c.display_name,
    lm.created_at
  from conversations c
  join last_msg lm on lm.conversation_id = c.id
  where c.follow_up_sent_at is null
    and c.mode <> 'HUMAN'
    and c.client_slug = p_client_slug
    and c.source = any(p_sources)
    and lm.role = 'assistant'
    and lm.created_at <= now() - (p_delay_ms || ' milliseconds')::interval
    and not exists (
      select 1 from agent_notifications an
      where an.conversation_id = c.id
    )
  order by lm.created_at asc
  limit 100;
$$;

comment on function public.find_followup_candidates is
  'Devuelve hasta 100 conversaciones elegibles para follow-up automatico, incluyendo display_name para personalizar el copy.';
