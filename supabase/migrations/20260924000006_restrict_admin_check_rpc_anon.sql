-- =========================================================
-- Todo Artesanal v2 — Fase 6
-- 20260924000006_restrict_admin_check_rpc_anon.sql
--
-- Responsabilidad:
--   - Completar el control de acceso del RPC public.is_user_admin().
--   - El frontend autenticado puede ejecutarlo.
--   - Los clientes anonimos no pueden consultar si un UUID pertenece
--     a admin_users.
--
-- Seguridad:
--   - No se concede acceso directo a private.admin_users.
--   - La función continúa siendo SECURITY DEFINER y solo devuelve
--     un booleano.
-- =========================================================

revoke execute on function public.is_user_admin(uuid) from anon;
grant execute on function public.is_user_admin(uuid) to authenticated;
