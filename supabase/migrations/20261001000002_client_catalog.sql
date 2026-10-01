-- =========================================================
-- Todo Artesanal v2 — Fase 7
-- client_catalog.sql
--
-- Responsabilidad:
--   - permitir que un cliente vea el catálogo activo (platos y menús
--     con su última versión) para pedir una **media vianda libre**.
--
-- Contexto:
--   El RLS de cliente solo expone los `dish_versions` / `menu_versions`
--   que forman parte de la oferta de la semana activa
--   (`*_client_select_active`), y NO hay policy de cliente para
--   `dishes` / `menus`. Como la decisión de dominio
--   (`docs/decisiones/20260929-media-vianda-catalogo.md`) permite la
--   media vianda desde todo el catálogo, hace falta una vía explícita.
--
--   Se expone con un RPC `security definer` en lugar de abrir RLS sobre
--   `dishes` / `menus`: así se conserva la invariante "sin policies de
--   cliente para el catálogo" y se devuelve solo lo mínimo (tipo, ids y
--   nombre de la última versión). El precio efectivo no se calcula acá:
--   lo resuelve `calculate_my_order_price`.
--
-- Orden de aplicación: posterior a 20261001000001.
-- =========================================================

create or replace function public.list_client_catalog()
returns table (
  product_type text,
  product_id uuid,
  version_id uuid,
  name text
)
language plpgsql
security definer
set search_path = public, private
stable
as $$
begin
  -- -------------------------------------------------------
  -- Solo clientes autenticados (claim client_id en el JWT).
  -- -------------------------------------------------------
  if private.current_client_id() is null then
    raise exception
      'Se requiere un cliente autenticado para ver el catálogo';
  end if;


  -- -------------------------------------------------------
  -- Platos activos con su última versión.
  -- -------------------------------------------------------
  return query
    select
      'dish'::text,
      d.id,
      dv.id,
      dv.name
    from public.dishes d
    join lateral (
      select v.id, v.name
      from public.dish_versions v
      where v.dish_id = d.id
      order by v.version_number desc
      limit 1
    ) dv on true
    where d.active = true
    order by dv.name, d.id;


  -- -------------------------------------------------------
  -- Menús activos con su última versión.
  -- -------------------------------------------------------
  return query
    select
      'menu'::text,
      m.id,
      mv.id,
      mv.name
    from public.menus m
    join lateral (
      select v.id, v.name
      from public.menu_versions v
      where v.menu_id = m.id
      order by v.version_number desc
      limit 1
    ) mv on true
    where m.active = true
    order by mv.name, m.id;
end;
$$;


revoke all on function public.list_client_catalog() from public;
grant execute on function public.list_client_catalog() to authenticated;


-- =========================================================
-- FIN client_catalog.sql
-- =========================================================
