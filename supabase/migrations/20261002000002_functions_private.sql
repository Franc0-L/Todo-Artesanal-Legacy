-- Todo Artesanal - 0002 - Funciones de private (helpers de identidad + trigger functions) y sus grants.


CREATE FUNCTION private.check_menu_version_main() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform private.validate_menu_version_has_main(
      new.menu_version_id
    );

  elsif tg_op = 'UPDATE' then
    perform private.validate_menu_version_has_main(
      new.menu_version_id
    );

    -- Si el item se movió de una versión a otra, verificar
    -- también que la versión anterior siga teniendo su main.
    if new.menu_version_id is distinct from old.menu_version_id then
      perform private.validate_menu_version_has_main(
        old.menu_version_id
      );
    end if;

  elsif tg_op = 'DELETE' then
    perform private.validate_menu_version_has_main(
      old.menu_version_id
    );
  end if;

  return null;
end;
$$;




CREATE FUNCTION private.current_client_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_raw text;
begin
  v_raw := auth.jwt() ->> 'client_id';

  if v_raw is null or v_raw = '' then
    return null;
  end if;

  begin
    return v_raw::uuid;
  exception when others then
    return null;
  end;
end;
$$;




CREATE FUNCTION private.default_week_day_cutoff() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  if new.cutoff_at is null then
    new.cutoff_at := (((new.date - 1) + time '20:00')
                        at time zone 'America/Argentina/Buenos_Aires');
  end if;
  return new;
end;
$$;




CREATE FUNCTION private.enforce_client_day_cutoff() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_day_id uuid;
  v_cutoff_at timestamptz;
begin
  -- Sin identidad de cliente no hay cierre de horario: admin,
  -- service_role y scripts quedan exentos.
  if private.current_client_id() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_week_day_id := case
    when tg_op = 'DELETE' then old.week_day_id
    else new.week_day_id
  end if;

  select wd.cutoff_at
  into v_cutoff_at
  from public.week_days wd
  where wd.id = v_week_day_id;

  -- Si el día no existe, otra validación lo rechaza con un mensaje
  -- más preciso (validate_order / FK); acá no nos entrometemos.
  if found and now() > v_cutoff_at then
    raise exception 'Fuera de horario: las respuestas para este día cerraron el %',
      to_char(v_cutoff_at at time zone 'America/Argentina/Buenos_Aires',
              'DD/MM/YYYY HH24:MI');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;




CREATE FUNCTION private.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
  select exists (
    select 1
    from private.admin_users
    where user_id = auth.uid()
  );
$$;




CREATE FUNCTION private.prevent_cancellation_with_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_client_id uuid;
  v_week_day_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_client_id := new.client_id;
  v_week_day_id := new.week_day_id;

  if exists (
    select 1
    from public.orders o
    where o.client_id = v_client_id
      and o.week_day_id = v_week_day_id
  ) then
    raise exception
      'El cliente ya tiene un pedido para ese día y no puede registrarse una cancelación';
  end if;

  return new;
end;
$$;




CREATE FUNCTION private.prevent_closed_cancellation_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_day_id uuid;
  v_week_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_week_day_id := old.week_day_id;
  else
    v_week_day_id := new.week_day_id;
  end if;

  select week_id
  into v_week_id
  from public.week_days
  where id = v_week_day_id;

  select status
  into v_status
  from public.weeks
  where id = v_week_id;

  if v_status = 'closed' then
    raise exception
      'No se puede modificar una cancelación de una semana cerrada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;




CREATE FUNCTION private.prevent_closed_order_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_day_id uuid;
  v_week_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_week_day_id := old.week_day_id;
  else
    v_week_day_id := new.week_day_id;
  end if;

  select wd.week_id
  into v_week_id
  from public.week_days wd
  where wd.id = v_week_day_id;

  select w.status
  into v_status
  from public.weeks w
  where w.id = v_week_id;

  if v_status = 'closed' then
    raise exception
      'No se puede modificar un pedido de una semana cerrada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;




CREATE FUNCTION private.prevent_closed_week_day_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_week_id := old.week_id;
  else
    v_week_id := new.week_id;
  end if;

  select status
  into v_status
  from public.weeks
  where id = v_week_id;

  if v_status = 'closed' then
    raise exception
      'No se puede modificar una semana cerrada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;




CREATE FUNCTION private.prevent_closed_week_day_option_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_day_id uuid;
  v_week_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_week_day_id := old.week_day_id;
  else
    v_week_day_id := new.week_day_id;
  end if;

  select wd.week_id
  into v_week_id
  from public.week_days wd
  where wd.id = v_week_day_id;

  select w.status
  into v_status
  from public.weeks w
  where w.id = v_week_id;

  if v_status = 'closed' then
    raise exception
      'No se puede modificar una opción de una semana cerrada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;




CREATE FUNCTION private.prevent_direct_week_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status is distinct from old.status
     and coalesce(
       current_setting(
         'todo_artesanal.allow_week_transition',
         true
       ),
       'false'
     ) <> 'true'
  then
    raise exception
      'El estado de una semana solo puede modificarse mediante las funciones de dominio';
  end if;

  return new;
end;
$$;




CREATE FUNCTION private.prevent_dish_version_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception
    'Las versiones de platos son inmutables';
end;
$$;




CREATE FUNCTION private.prevent_menu_version_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception
    'Las versiones de menús son inmutables';
end;
$$;




CREATE FUNCTION private.prevent_order_with_cancellation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_client_id uuid;
  v_week_day_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_client_id := new.client_id;
  v_week_day_id := new.week_day_id;

  if exists (
    select 1
    from public.cancellations c
    where c.client_id = v_client_id
      and c.week_day_id = v_week_day_id
  ) then
    raise exception
      'El cliente tiene una cancelación para ese día y no puede registrarse un pedido';
  end if;

  return new;
end;
$$;




CREATE FUNCTION private.prevent_ordered_option_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_option_id uuid;
begin
  if tg_op = 'DELETE' then
    v_option_id := old.id;
  else
    v_option_id := new.id;
  end if;

  if exists (
    select 1
    from public.orders o
    where o.week_day_option_id = v_option_id
  ) then
    raise exception
      'No se puede modificar o eliminar una opción que ya tiene pedidos asociados';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;




CREATE FUNCTION private.validate_menu_version_has_main(p_menu_version_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  if not exists (
    select 1
    from public.menu_version_items
    where menu_version_id = p_menu_version_id
      and role = 'main'
  ) then
    raise exception
      'La versión de menú % debe tener exactamente un plato principal',
      p_menu_version_id;
  end if;
end;
$$;




CREATE FUNCTION private.validate_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_id uuid;
  v_week_day_id uuid;
  v_week_status text;
  v_expected boolean;
  v_offer_modality text;
begin
  if new.week_day_option_id is not null then
    select wd.week_id, wd.id, wdo.offer_modality
    into v_week_id, v_week_day_id, v_offer_modality
    from public.week_day_options wdo
    join public.week_days wd on wd.id = wdo.week_day_id
    where wdo.id = new.week_day_option_id;

    if not found then
      raise exception
        'La opción de día % no existe', new.week_day_option_id;
    end if;

    new.week_day_id := v_week_day_id;
  else
    if new.week_day_id is null then
      raise exception
        'El pedido debe indicar un día de la semana';
    end if;

    select wd.week_id
    into v_week_id
    from public.week_days wd
    where wd.id = new.week_day_id;

    if not found then
      raise exception 'El día % no existe', new.week_day_id;
    end if;
  end if;

  select w.status
  into v_week_status
  from public.weeks w
  where w.id = v_week_id;

  if v_week_status <> 'active' then
    raise exception
      'Solo se pueden gestionar pedidos de una semana activa';
  end if;

  select exists (
    select 1
    from public.week_expected_clients wec
    where wec.week_id = v_week_id
      and wec.client_id = new.client_id
  ) into v_expected;

  if not v_expected then
    raise exception
      'El cliente % no pertenece a los clientes esperados de la semana',
      new.client_id;
  end if;

  -- General/Opcional los determina la oferta, no quien crea el pedido.
  if new.modality in ('general', 'opcional') then
    new.modality := v_offer_modality;
  end if;

  if tg_op = 'INSERT' then
    if new.dish_version_id is not null
       or new.menu_version_id is not null then

      if new.modality <> 'media_vianda' then
        raise exception
          'Solo la media vianda puede pedirse desde el catálogo';
      end if;

      new.applied_price := public.calculate_catalog_media_vianda_price(
        new.client_id,
        new.dish_version_id,
        new.menu_version_id
      );
    else
      new.applied_price := public.calculate_order_price(
        new.client_id,
        new.week_day_option_id,
        new.modality
      );
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id then
      raise exception 'client_id no puede modificarse en un pedido';
    end if;

    if new.week_day_option_id is distinct from old.week_day_option_id then
      raise exception 'week_day_option_id no puede modificarse en un pedido';
    end if;

    if new.week_day_id is distinct from old.week_day_id then
      raise exception 'week_day_id no puede modificarse en un pedido';
    end if;

    if new.dish_version_id is distinct from old.dish_version_id then
      raise exception 'dish_version_id no puede modificarse en un pedido';
    end if;

    if new.menu_version_id is distinct from old.menu_version_id then
      raise exception 'menu_version_id no puede modificarse en un pedido';
    end if;

    if new.modality is distinct from old.modality then
      raise exception 'modality no puede modificarse en un pedido';
    end if;

    if new.applied_price is distinct from old.applied_price then
      raise exception 'applied_price no puede modificarse en un pedido';
    end if;

    return new;
  end if;

  return new;
end;
$$;



revoke all on function private.is_admin() from public;
revoke all on function private.current_client_id() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_client_id() to authenticated;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;
revoke all on table private.admin_users from public;
revoke all on table private.admin_users from authenticated;
grant select on table private.admin_users to service_role;
