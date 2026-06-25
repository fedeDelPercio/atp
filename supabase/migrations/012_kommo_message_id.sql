-- ===========================================================================
-- 012_kommo_message_id.sql — Idempotencia del receiver de webhook Kommo.
--
-- Kommo a veces dispara su webhook "Mensaje entrante recibido" más de una
-- vez por mensaje (visto en producción: gaps de 4 minutos entre el original
-- y el duplicado). Sin idempotencia, el agente procesa el mensaje cada vez
-- y el lead recibe respuestas duplicadas.
--
-- Solución: cada mensaje de Kommo trae un `id` único en el payload
-- (`message[add][0][id]`). Lo guardamos en `kommo_message_id` y el endpoint
-- chequea antes de insertar: si ya existe, skip.
-- ===========================================================================

alter table messages add column kommo_message_id text;

create unique index messages_kommo_message_id_idx
  on messages (kommo_message_id)
  where kommo_message_id is not null;
