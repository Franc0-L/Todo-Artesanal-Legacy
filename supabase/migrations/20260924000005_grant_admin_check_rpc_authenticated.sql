-- =========================================================
-- Todo Artesanal v2 — Fase 6
-- 20260924000005_grant_admin_check_rpc_authenticated.sql
--
-- Responsabilidad:
--   - Permitir que usuarios autenticados ejecuten el RPC
--     public.is_user_admin() usado por el frontend administrativo.
--
-- Seguridad:
--   - La función sigue siendo SECURITY DEFINER.
--   - Solo devuelve un booleano.
--   - La autorización real continúa dependiendo de
--     private.admin_users y de las políticas/RLS existentes.
--   - No se concede acceso directo a private.admin_users.
-- =========================================================

grant execute on function public.is_user_admin(uuid) to authenticated;
