-- ===========================================================================
-- 014_follow_ups.sql
--
-- Seguimiento automatico (follow-up) cuando el lead no responde.
--
-- Idea: si el ultimo mensaje de la conversacion es del agente (assistant) y
-- pasaron > N minutos sin que el lead responda, mandamos UN unico mensaje
-- de seguimiento ("Quedo por aca si te surge cualquier duda"). Despues de
-- ese mensaje no se vuelve a insistir, por mas que el lead siga sin
-- responder.
--
-- - Columna `follow_up_sent_at`: timestamp del envio. Si es NULL, todavia
--   no se mando. Si tiene valor, no se vuelve a mandar.
-- - RPC `find_followup_candidates`: devuelve las conversaciones elegibles
--   en un solo round-trip. Filtra por: no derivada, modo != HUMAN, source
--   en la lista, ultimo mensaje role='assistant' hace >= delay.
-- ===========================================================================

alter table conversations
  add column if not exists follow_up_sent_at timestamptz;

comment on column conversations.follow_up_sent_at is
  'Timestamp del mensaje de seguimiento automatico. NULL si todavia no se mando. Se manda una sola vez.';

-- Indice parcial: solo las convs sin follow-up (las que pueden ser
-- candidatas). La gran mayoria de las convs viejas van a tener este campo
-- seteado, asi que el indice se mantiene chico.
create index if not exists conversations_follow_up_pending_idx
  on conversations (updated_at desc)
  where follow_up_sent_at is null;

-- ===========================================================================
-- find_followup_candidates: devuelve convs elegibles para follow-up.
--
-- Criterios (todos deben cumplirse):
--  1. follow_up_sent_at IS NULL  (nunca se mando uno)
--  2. mode != 'HUMAN'            (no la agarro un asesor)
--  3. source = ANY(p_sources)    (filtrable: 'test' primero, luego 'whatsapp')
--  4. client_slug = p_client_slug
--  5. No tiene agent_notifications (no fue derivada)
--  6. Ultimo mensaje de la conv:
--     - role = 'assistant'       (le hablo el bot y el lead no contesto)
--     - created_at <= now() - p_delay_ms
-- ===========================================================================
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
  'Devuelve hasta 100 conversaciones elegibles para mandarles follow-up automatico.';
