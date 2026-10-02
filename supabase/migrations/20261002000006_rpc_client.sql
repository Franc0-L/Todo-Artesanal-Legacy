-- Todo Artesanal - 0006 - RPCs de cliente (security definer, identidad propia).


CREATE FUNCTION public.calculate_my_order_price(p_week_day_option_id uuid, p_dish_version_id uuid, p_menu_version_id uuid, p_modality text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
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




CREATE FUNCTION public.list_client_catalog() RETURNS TABLE(product_type text, product_id uuid, version_id uuid, name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
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



revoke all on function public.calculate_my_order_price(uuid, uuid, uuid, text) from public;
grant execute on function public.calculate_my_order_price(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.list_client_catalog() from public;
grant execute on function public.list_client_catalog() to authenticated;
