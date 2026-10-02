-- Todo Artesanal - 0005 - RPCs de admin/catalogo/precio interno.


CREATE FUNCTION public.activate_week(p_week_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_status text;
  v_day_count integer;
  v_invalid_day_count integer;
  v_invalid_menu_count integer;
  v_duplicate_dish_count integer;
  v_duplicate_menu_count integer;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores pueden activar semanas';
  end if;

  select status into v_status from public.weeks where id = p_week_id;
  if not found then
    raise exception 'La semana % no existe', p_week_id;
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo se puede activar una semana en estado draft. Estado actual: %', v_status;
  end if;

  if exists (select 1 from public.weeks where status = 'active' and id <> p_week_id) then
    raise exception 'Ya existe otra semana activa';
  end if;

  select count(*) into v_day_count from public.week_days where week_id = p_week_id;
  if v_day_count <> 5 then
    raise exception 'La semana debe tener exactamente 5 días para activarse. Tiene %', v_day_count;
  end if;

  -- Cada día debe tener una oferta General y una Opcional.
  select count(*) into v_invalid_day_count
  from public.week_days wd
  where wd.week_id = p_week_id
    and (
      not exists (
        select 1 from public.week_day_options wdo
        where wdo.week_day_id = wd.id and wdo.offer_modality = 'general'
      )
      or not exists (
        select 1 from public.week_day_options wdo
        where wdo.week_day_id = wd.id and wdo.offer_modality = 'opcional'
      )
    );
  if v_invalid_day_count > 0 then
    raise exception 'No se puede activar la semana: cada día debe tener una opción General y una opción Opcional. Días incompletos: %', v_invalid_day_count;
  end if;

  -- Un mismo plato no puede estar en dos días de la semana.
  select count(*) into v_duplicate_dish_count
  from (
    select dv.dish_id
    from public.week_day_options wdo
    join public.week_days wd on wd.id = wdo.week_day_id
    join public.dish_versions dv on dv.id = wdo.dish_version_id
    where wd.week_id = p_week_id and wdo.option_type = 'dish'
    group by dv.dish_id
    having count(*) > 1
  ) duplicates;
  if v_duplicate_dish_count > 0 then
    raise exception 'No se puede activar la semana: hay platos repetidos en distintos días';
  end if;

  -- Un mismo menú no puede estar en dos días de la semana.
  select count(*) into v_duplicate_menu_count
  from (
    select mv.menu_id
    from public.week_day_options wdo
    join public.week_days wd on wd.id = wdo.week_day_id
    join public.menu_versions mv on mv.id = wdo.menu_version_id
    where wd.week_id = p_week_id and wdo.option_type = 'menu'
    group by mv.menu_id
    having count(*) > 1
  ) duplicates;
  if v_duplicate_menu_count > 0 then
    raise exception 'No se puede activar la semana: hay menús repetidos en distintos días';
  end if;

  -- Cada menú ofrecido debe tener exactamente 1 plato principal.
  select count(*) into v_invalid_menu_count
  from (
    select distinct wdo.menu_version_id
    from public.week_day_options wdo
    join public.week_days wd on wd.id = wdo.week_day_id
    where wd.week_id = p_week_id and wdo.option_type = 'menu'
  ) used_menus
  where (
    select count(*)
    from public.menu_version_items mvi
    where mvi.menu_version_id = used_menus.menu_version_id
      and mvi.role = 'main'
  ) <> 1;

  if v_invalid_menu_count > 0 then
    raise exception 'No se puede activar la semana: existen % versiones de menú utilizadas sin exactamente un plato principal', v_invalid_menu_count;
  end if;

  insert into public.week_expected_clients (week_id, client_id)
  select p_week_id, c.id from public.clients c where c.active = true;

  perform set_config('todo_artesanal.allow_week_transition', 'true', true);

  update public.weeks
  set status = 'active', updated_at = now()
  where id = p_week_id;
end;
$$;




CREATE FUNCTION public.calculate_catalog_media_vianda_price(p_client_id uuid, p_dish_version_id uuid, p_menu_version_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_allows_half_portion boolean;
  v_dish_id uuid;
  v_base_price numeric(10,2);
  v_client_price numeric(10,2);
  v_product_price numeric(10,2);
  v_normal_price numeric(10,2);
begin
  if ((p_dish_version_id is not null)::int
      + (p_menu_version_id is not null)::int) <> 1 then
    raise exception
      'La media vianda de catálogo necesita exactamente un plato o un menú';
  end if;

  select c.allows_half_portion
  into v_allows_half_portion
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'El cliente % no existe', p_client_id;
  end if;

  if not v_allows_half_portion then
    raise exception
      'El cliente % no tiene habilitada la modalidad media_vianda',
      p_client_id;
  end if;

  if p_dish_version_id is not null then
    select dv.dish_id, dv.price
    into v_dish_id, v_base_price
    from public.dish_versions dv
    where dv.id = p_dish_version_id;

    if not found then
      raise exception
        'La versión de plato % no existe',
        p_dish_version_id;
    end if;

    select cpp.price
    into v_product_price
    from public.client_product_prices cpp
    where cpp.client_id = p_client_id
      and cpp.dish_id = v_dish_id;
  else
    select mv.price
    into v_base_price
    from public.menu_versions mv
    where mv.id = p_menu_version_id;

    if not found then
      raise exception
        'La versión de menú % no existe',
        p_menu_version_id;
    end if;
  end if;

  select cp.price
  into v_client_price
  from public.client_prices cp
  where cp.client_id = p_client_id
    and cp.modality = 'general';

  if p_dish_version_id is not null then
    v_normal_price := coalesce(v_product_price, v_client_price, v_base_price);
  else
    v_normal_price := coalesce(v_client_price, v_base_price);
  end if;

  if v_normal_price is null then
    raise exception
      'No se pudo determinar el precio de la media vianda seleccionada';
  end if;

  return round(v_normal_price / 2, 2)::numeric(10,2);
end;
$$;




CREATE FUNCTION public.calculate_order_price(p_client_id uuid, p_week_day_option_id uuid, p_modality text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_allows_half_portion boolean;

  v_week_status text;
  v_option_type text;

  v_dish_id uuid;
  v_base_price numeric(10,2);

  v_client_price numeric(10,2);
  v_product_price numeric(10,2);

  v_normal_price numeric(10,2);
begin
  -- -------------------------------------------------------
  -- La función debe rechazar modalidades inválidas incluso
  -- cuando sea invocada directamente, sin pasar por orders.
  -- -------------------------------------------------------
  if p_modality not in ('general', 'opcional', 'media_vianda') then
    raise exception
      'Modalidad de pedido inválida: %',
      p_modality;
  end if;


  -- -------------------------------------------------------
  -- El cliente debe existir.
  -- -------------------------------------------------------
  select c.allows_half_portion
  into v_allows_half_portion
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception
      'El cliente % no existe',
      p_client_id;
  end if;


  -- -------------------------------------------------------
  -- Media vianda solamente está disponible para clientes
  -- que tengan habilitada explícitamente esta modalidad.
  -- -------------------------------------------------------
  if p_modality = 'media_vianda'
     and not v_allows_half_portion then

    raise exception
      'El cliente % no tiene habilitada la modalidad media_vianda',
      p_client_id;
  end if;


  -- -------------------------------------------------------
  -- Obtener la opción y su semana.
  --
  -- v_dish_id:
  --   - opción dish → dish_id real;
  --   - opción menu → NULL deliberadamente.
  --
  -- Esto es importante porque client_product_prices aplica
  -- solamente a platos individuales y nunca sustituye el
  -- precio de una menu_version.
  -- -------------------------------------------------------
  select
    w.status,
    wdo.option_type,
    case
      when wdo.option_type = 'dish'
        then dv.dish_id
      else null
    end,
    case
      when wdo.option_type = 'dish'
        then dv.price
      when wdo.option_type = 'menu'
        then mv.price
    end
  into
    v_week_status,
    v_option_type,
    v_dish_id,
    v_base_price
  from public.week_day_options wdo
  join public.week_days wd
    on wd.id = wdo.week_day_id
  join public.weeks w
    on w.id = wd.week_id
  left join public.dish_versions dv
    on wdo.option_type = 'dish'
   and dv.id = wdo.dish_version_id
  left join public.menu_versions mv
    on wdo.option_type = 'menu'
   and mv.id = wdo.menu_version_id
  where wdo.id = p_week_day_option_id;

  if not found then
    raise exception
      'La opción de oferta % no existe',
      p_week_day_option_id;
  end if;


  -- -------------------------------------------------------
  -- Los pedidos solamente pueden realizarse sobre una
  -- semana activa.
  -- -------------------------------------------------------
  if v_week_status <> 'active' then
    raise exception
      'La semana de la opción % no está activa',
      p_week_day_option_id;
  end if;


  -- -------------------------------------------------------
  -- Precio específico por plato.
  --
  -- Se consulta únicamente para opciones DISH.
  -- Para MENU v_dish_id es NULL y esta consulta no puede
  -- encontrar/aplicar un precio específico de plato.
  -- -------------------------------------------------------
  if v_option_type = 'dish' then
    select cpp.price
    into v_product_price
    from public.client_product_prices cpp
    where cpp.client_id = p_client_id
      and cpp.dish_id = v_dish_id;
  end if;


  -- -------------------------------------------------------
  -- MEDIA VIANDA
  --
  -- Siempre parte de la rama GENERAL.
  --
  -- DISH:
  --   precio específico del plato
  --   > precio general del cliente
  --   > precio base del plato
  --
  -- MENU:
  --   precio general del cliente
  --   > precio base del menú
  --
  -- Nunca se utiliza client_prices['opcional'].
  -- -------------------------------------------------------
  if p_modality = 'media_vianda' then

    select cp.price
    into v_client_price
    from public.client_prices cp
    where cp.client_id = p_client_id
      and cp.modality = 'general';

    if v_option_type = 'dish' then
      v_normal_price := coalesce(
        v_product_price,
        v_client_price,
        v_base_price
      );
    else
      v_normal_price := coalesce(
        v_client_price,
        v_base_price
      );
    end if;

    if v_normal_price is null then
      raise exception
        'No se pudo determinar el precio para la opción %',
        p_week_day_option_id;
    end if;

    return round(v_normal_price / 2, 2)::numeric(10,2);
  end if;


  -- -------------------------------------------------------
  -- GENERAL / OPCIONAL
  --
  -- DISH:
  --   precio específico del plato
  --   > precio especial de modalidad
  --   > precio base
  --
  -- MENU:
  --   precio especial de modalidad
  --   > precio base del menú
  -- -------------------------------------------------------
  select cp.price
  into v_client_price
  from public.client_prices cp
  where cp.client_id = p_client_id
    and cp.modality = p_modality;


  if v_option_type = 'dish' then
    v_normal_price := coalesce(
      v_product_price,
      v_client_price,
      v_base_price
    );
  else
    v_normal_price := coalesce(
      v_client_price,
      v_base_price
    );
  end if;

  if v_normal_price is null then
    raise exception
      'No se pudo determinar el precio para la opción %',
      p_week_day_option_id;
  end if;

  return v_normal_price::numeric(10,2);
end;
$$;




CREATE FUNCTION public.close_week(p_week_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_status text;
begin
  -- -------------------------------------------------------
  -- Solamente administradores pueden cerrar semanas.
  -- -------------------------------------------------------
  if not private.is_admin() then
    raise exception
      'Solo administradores pueden cerrar semanas';
  end if;


  -- -------------------------------------------------------
  -- Obtener y validar la semana.
  -- -------------------------------------------------------
  select w.status
  into v_status
  from public.weeks w
  where w.id = p_week_id;

  if not found then
    raise exception
      'La semana % no existe',
      p_week_id;
  end if;


  -- -------------------------------------------------------
  -- No se permite saltar de draft a closed y closed es
  -- terminal.
  -- -------------------------------------------------------
  if v_status <> 'active' then
    raise exception
      'Solo se puede cerrar una semana en estado active. Estado actual: %',
      v_status;
  end if;


  -- -------------------------------------------------------
  -- Autorizar el cambio de status para el trigger de weeks.
  -- -------------------------------------------------------
  perform set_config(
    'todo_artesanal.allow_week_transition',
    'true',
    true
  );


  -- -------------------------------------------------------
  -- Transición: active → closed
  -- -------------------------------------------------------
  update public.weeks
  set
    status = 'closed',
    updated_at = now()
  where id = p_week_id;
end;
$$;




CREATE FUNCTION public.create_menu(p_name text, p_price numeric, p_items jsonb, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_menu_id uuid;
  v_menu_version_id uuid;
  v_item_count integer;
  v_distinct_dish_version_count integer;
  v_main_count integer := 0;
  v_item jsonb;
  v_dish_version_id uuid;
  v_role text;
begin
  if not private.is_admin() then
    raise exception
      'Solo administradores pueden crear menús';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception
      'El nombre del menú no puede estar vacío';
  end if;

  if p_price is null or p_price < 0 then
    raise exception
      'El precio debe ser mayor o igual a 0';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception
      'p_items debe ser un array jsonb';
  end if;

  select
    count(*),
    count(distinct elem ->> 'dish_version_id')
  into
    v_item_count,
    v_distinct_dish_version_count
  from jsonb_array_elements(p_items) as elem;

  if v_item_count = 0 then
    raise exception
      'El menú debe tener al menos un ítem (el plato principal)';
  end if;

  if v_distinct_dish_version_count <> v_item_count then
    raise exception
      'No se puede repetir el mismo dish_version_id dentro del menú';
  end if;

  -- -------------------------------------------------------
  -- Validar forma de cada ítem, existencia del dish_version_id
  -- referenciado, y contar los role='main'.
  -- -------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not jsonb_exists(v_item, 'dish_version_id')
       or not jsonb_exists(v_item, 'role') then
      raise exception
        'Cada ítem debe tener dish_version_id y role';
    end if;

    begin
      v_dish_version_id := (v_item ->> 'dish_version_id')::uuid;
    exception when others then
      raise exception
        'dish_version_id inválido: %',
        v_item ->> 'dish_version_id';
    end;

    v_role := v_item ->> 'role';

    if v_role not in ('main', 'side') then
      raise exception
        'role debe ser "main" o "side", recibido: %',
        v_role;
    end if;

    if not exists (
      select 1 from public.dish_versions dv
      where dv.id = v_dish_version_id
    ) then
      raise exception
        'dish_version_id % no existe',
        v_dish_version_id;
    end if;

    if v_role = 'main' then
      v_main_count := v_main_count + 1;
    end if;
  end loop;

  if v_main_count <> 1 then
    raise exception
      'El menú debe tener exactamente 1 ítem con role=main. Recibidos: %',
      v_main_count;
  end if;

  -- -------------------------------------------------------
  -- Inserciones. Si algo falla desde acá — incluido el trigger
  -- diferible al COMMIT — toda la transacción se revierte.
  -- -------------------------------------------------------

  insert into public.menus (active)
  values (coalesce(p_active, true))
  returning id into v_menu_id;

  insert into public.menu_versions (
    menu_id,
    version_number,
    name,
    price
  )
  values (
    v_menu_id,
    1,
    btrim(p_name),
    p_price
  )
  returning id into v_menu_version_id;

  insert into public.menu_version_items (
    menu_version_id,
    dish_version_id,
    role
  )
  select
    v_menu_version_id,
    (elem ->> 'dish_version_id')::uuid,
    elem ->> 'role'
  from jsonb_array_elements(p_items) as elem;

  return v_menu_id;
end;
$$;




CREATE FUNCTION public.create_menu_version(p_menu_id uuid, p_name text, p_price numeric, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_menu_version_id uuid;
  v_next_version_number integer;
  v_item_count integer;
  v_distinct_dish_version_count integer;
  v_main_count integer := 0;
  v_item jsonb;
  v_dish_version_id uuid;
  v_role text;
begin
  if not private.is_admin() then
    raise exception
      'Solo administradores pueden crear versiones de menú';
  end if;

  if not exists (
    select 1 from public.menus m where m.id = p_menu_id
  ) then
    raise exception
      'El menú % no existe',
      p_menu_id;
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception
      'El nombre de la versión no puede estar vacío';
  end if;

  if p_price is null or p_price < 0 then
    raise exception
      'El precio debe ser mayor o igual a 0';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception
      'p_items debe ser un array jsonb';
  end if;

  select
    count(*),
    count(distinct elem ->> 'dish_version_id')
  into
    v_item_count,
    v_distinct_dish_version_count
  from jsonb_array_elements(p_items) as elem;

  if v_item_count = 0 then
    raise exception
      'La versión debe tener al menos un ítem (el plato principal)';
  end if;

  if v_distinct_dish_version_count <> v_item_count then
    raise exception
      'No se puede repetir el mismo dish_version_id dentro de la versión';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not jsonb_exists(v_item, 'dish_version_id')
       or not jsonb_exists(v_item, 'role') then
      raise exception
        'Cada ítem debe tener dish_version_id y role';
    end if;

    begin
      v_dish_version_id := (v_item ->> 'dish_version_id')::uuid;
    exception when others then
      raise exception
        'dish_version_id inválido: %',
        v_item ->> 'dish_version_id';
    end;

    v_role := v_item ->> 'role';

    if v_role not in ('main', 'side') then
      raise exception
        'role debe ser "main" o "side", recibido: %',
        v_role;
    end if;

    if not exists (
      select 1 from public.dish_versions dv
      where dv.id = v_dish_version_id
    ) then
      raise exception
        'dish_version_id % no existe',
        v_dish_version_id;
    end if;

    if v_role = 'main' then
      v_main_count := v_main_count + 1;
    end if;
  end loop;

  if v_main_count <> 1 then
    raise exception
      'La versión debe tener exactamente 1 ítem con role=main. Recibidos: %',
      v_main_count;
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_next_version_number
  from public.menu_versions
  where menu_id = p_menu_id;

  insert into public.menu_versions (
    menu_id,
    version_number,
    name,
    price
  )
  values (
    p_menu_id,
    v_next_version_number,
    btrim(p_name),
    p_price
  )
  returning id into v_menu_version_id;

  insert into public.menu_version_items (
    menu_version_id,
    dish_version_id,
    role
  )
  select
    v_menu_version_id,
    (elem ->> 'dish_version_id')::uuid,
    elem ->> 'role'
  from jsonb_array_elements(p_items) as elem;

  return v_menu_version_id;
end;
$$;




CREATE FUNCTION public.create_week(p_start_date date, p_end_date date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_id uuid;
  v_day integer;
begin
  if not private.is_admin() then
    raise exception
      'Solo administradores pueden crear semanas';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception
      'Las fechas de inicio y fin son obligatorias';
  end if;

  if p_start_date > p_end_date then
    raise exception
      'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if extract(isodow from p_start_date) <> 1 then
    raise exception
      'La semana debe comenzar un lunes';
  end if;

  if extract(isodow from p_end_date) <> 5 then
    raise exception
      'La semana debe terminar un viernes';
  end if;

  if (p_end_date - p_start_date) <> 4 then
    raise exception
      'La semana debe tener exactamente 5 días (lunes a viernes)';
  end if;

  insert into public.weeks (start_date, end_date, status)
  values (p_start_date, p_end_date, 'draft')
  returning id into v_week_id;

  for v_day in 1..5 loop
    insert into public.week_days (week_id, day_of_week, date)
    values (v_week_id, v_day, p_start_date + (v_day - 1));
  end loop;

  return v_week_id;
end;
$$;




CREATE FUNCTION public.is_user_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
  select exists (
    select 1
    from private.admin_users
    where user_id = p_user_id
  );
$$;




CREATE FUNCTION public.update_week(p_week_id uuid, p_start_date date, p_end_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_status text;
  v_day integer;
begin
  if not private.is_admin() then
    raise exception
      'Solo administradores pueden actualizar semanas';
  end if;

  select status
  into v_status
  from public.weeks
  where id = p_week_id;

  if not found then
    raise exception
      'La semana % no existe',
      p_week_id;
  end if;

  if v_status <> 'draft' then
    raise exception
      'Solo se pueden modificar semanas en estado draft. Estado actual: %',
      v_status;
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception
      'Las fechas de inicio y fin son obligatorias';
  end if;

  if p_start_date > p_end_date then
    raise exception
      'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if extract(isodow from p_start_date) <> 1 then
    raise exception
      'La semana debe comenzar un lunes';
  end if;

  if extract(isodow from p_end_date) <> 5 then
    raise exception
      'La semana debe terminar un viernes';
  end if;

  if (p_end_date - p_start_date) <> 4 then
    raise exception
      'La semana debe tener exactamente 5 días (lunes a viernes)';
  end if;

  delete from public.week_days where week_id = p_week_id;

  for v_day in 1..5 loop
    insert into public.week_days (week_id, day_of_week, date)
    values (p_week_id, v_day, p_start_date + (v_day - 1));
  end loop;

  update public.weeks
  set
    start_date = p_start_date,
    end_date = p_end_date,
    updated_at = now()
  where id = p_week_id;
end;
$$;



revoke all on function public.is_user_admin(uuid) from public;
revoke all on function public.is_user_admin(uuid) from authenticated;
grant execute on function public.is_user_admin(uuid) to service_role;
grant execute on function public.is_user_admin(uuid) to authenticated;
revoke execute on function public.is_user_admin(uuid) from anon;
revoke all on function public.calculate_order_price(uuid, uuid, text) from public;
revoke all on function public.calculate_order_price(uuid, uuid, text) from authenticated;
revoke all on function public.calculate_catalog_media_vianda_price(uuid, uuid, uuid) from public;
revoke all on function public.calculate_catalog_media_vianda_price(uuid, uuid, uuid) from authenticated;
