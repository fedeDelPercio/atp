-- ===========================================================================
-- 013_asesor_role.sql
--
-- Suma 'asesor' a los roles válidos de profiles. El asesor solo accede a la
-- pestaña WhatsApp + Leads (gestiona conversaciones reales y hace seguimiento
-- comercial). Los accesos se controlan client-side en src/lib/profile.ts.
-- ===========================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check
  check (role in ('dev', 'client', 'asesor'));
