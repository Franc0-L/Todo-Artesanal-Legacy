-- =========================================================
-- Todo Artesanal v2 — Fase 7
-- client_effective_price.sql
--
-- Responsabilidad:
--   - exponer un RPC que devuelva el precio efectivo (unitario)
--     que verá el cliente en `/menu/:token` ANTES de pedir.
--
-- Contexto:
--   `calculate_order_price` y `calculate_catalog_media_vianda_price`
--   son `security definer` y NO están otorgadas a `authenticated`
--   (un cliente podría pasar el `client_id` de otro y filtrar sus
--   precios). El comentario de `20260923000004_rls.sql` dejó anotado
--   crear un wrapper que valide contra `current_client_id()`.
--
--   Este RPC es ese wrapper:
--     - ignora cualquier client_id entrante (no lo recibe);
--     - resuelve la identidad con `private.current_client_id()`,
--       leída del claim `client_id` del JWT del cliente.
--
-- Nota de seguridad:
--   El precio "de verdad" lo sigue congelando el trigger
--   `validate_order` en el INSERT de `orders`. Este RPC es solo una
--   estimación de UX: nunca se confía en un precio enviado por el
--   frontend.
--
-- Orden de aplicación: posterior a 20260929000002.
-- =========================================================

create or replace function public.calculate_my_order_price(
  p_week_day_option_id uuid,
  p_dish_version_id uuid,
  p_menu_version_id uuid,
  p_modality text
)
returns numeric(10,2)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_client_id uuid;
  v_source_count integer;
begin
  -- -------------------------------------------------------
  -- La identidad sale SOLO del JWT: nunca de un parámetro.
  -- -------------------------------------------------------
  v_client_id := private.current_client_id();

  if v_client_id is null then
    raise exception
      'Se requiere un cliente autenticado para calcular el precio';
  end if;


  -- -------------------------------------------------------
  -- Mismas modalidades que calculate_order_price.
  -- -------------------------------------------------------
  if p_modality not in ('general', 'opcional', 'media_vianda') then
    raise exception
      'Modalidad de pedido inválida: %',
      p_modality;
  end if;


  -- -------------------------------------------------------
  -- Debe indicarse exactamente una fuente de producto:
  --   - una opción de la oferta del día, o
  --   - un plato de catálogo, o
  --   - un menú de catálogo.
  -- -------------------------------------------------------
  v_source_count :=
      (p_week_day_option_id is not null)::int
    + (p_dish_version_id is not null)::int
    + (p_menu_version_id is not null)::int;

  if v_source_count <> 1 then
    raise exception
      'Debe indicarse exactamente una fuente de producto';
  end if;


  -- -------------------------------------------------------
  -- Rama oferta: delega en la función de dominio existente.
  -- -------------------------------------------------------
  if p_week_day_option_id is not null then
    return public.calculate_order_price(
      v_client_id,
      p_week_day_option_id,
      p_modality
    );
  end if;


  -- -------------------------------------------------------
  -- Rama catálogo: solo media vianda (igual que validate_order).
  -- -------------------------------------------------------
  if p_modality <> 'media_vianda' then
    raise exception
      'El catálogo solo admite pedidos de media vianda';
  end if;

  return public.calculate_catalog_media_vianda_price(
    v_client_id,
    p_dish_version_id,
    p_menu_version_id
  );
end;
$$;


-- ---------------------------------------------------------
-- Grants: solo `authenticated`. El RPC resuelve la identidad
-- por JWT, así que un admin (sin claim client_id) recibe el
-- error "Se requiere un cliente autenticado".
-- ---------------------------------------------------------
revoke all on function public.calculate_my_order_price(
  uuid,
  uuid,
  uuid,
  text
) from public;

grant execute on function public.calculate_my_order_price(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;


-- =========================================================
-- FIN client_effective_price.sql
-- =========================================================
