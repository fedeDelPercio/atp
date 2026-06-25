-- ===========================================================================
-- 011_kommo_integration.sql — Integración con Kommo CRM (canal: Salesbot).
--
-- iBath usa Kommo como CRM y como canal de WhatsApp (WhatsApp Lite). El
-- flujo end-to-end es:
--
--   Lead manda WA → Kommo recibe → Salesbot de Kommo dispara webhook al
--   panel (POST /api/integrations/kommo/incoming) → corremos el agente
--   sincrónicamente → devolvemos la respuesta → Salesbot la postea en el
--   chat (que sale por WA al lead).
--
-- Para que el matcheo entre conversaciones del panel y leads del CRM sea
-- estable necesitamos guardar los IDs de Kommo en cada conversation.
-- ===========================================================================

-- IDs de Kommo asociados a la conversación.
--   - kommo_lead_id: el ID del lead en el pipeline de Kommo (lo necesitamos
--     para mover el lead a otra etapa o agregar notas cuando el agente
--     deriva al equipo).
--   - kommo_contact_id: el contacto vinculado al lead. Lo guardamos por si
--     después queremos enriquecer datos (nombre, email, etc.) sin volver
--     a buscar.
alter table conversations
  add column kommo_lead_id bigint,
  add column kommo_contact_id bigint;

-- Lookup rápido cuando llega un evento de Salesbot con un lead_id concreto
-- y necesitamos encontrar/crear la conversation correspondiente.
create unique index conversations_kommo_lead_id_idx
  on conversations (kommo_lead_id)
  where kommo_lead_id is not null;
