-- =========================================================
-- Todo Artesanal
-- 20260929000002_fix_media_vianda_text.sql
--
-- Repara el texto de 6 mensajes de error de
-- 20260929000001_catalog_media_vianda.sql, que quedó con mojibake
-- (UTF-8 double-encoded) por la codificación de PowerShell 5.1 al
-- escribir el archivo.
--
-- NO cambia ninguna lógica: los tres cuerpos de función son idénticos
-- a los de la 0001 salvo por los strings corregidos.
--
-- Sin rollback: es un create or replace sobre funciones trigger; no
-- toca datos ni estructura. Re-aplicar la 0001 sería redundante.
-- =========================================================

-- ---------------------------------------------------------
-- 1. private.validate_order — mensajes con acentos correctos
-- ---------------------------------------------------------

create or replace function private.validate_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
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

-- ---------------------------------------------------------
-- 2. private.prevent_order_with_cancellation
-- ---------------------------------------------------------

create or replace function private.prevent_order_with_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
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


-- ---------------------------------------------------------
-- 3. private.prevent_cancellation_with_order
-- ---------------------------------------------------------

create or replace function private.prevent_cancellation_with_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
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

-- ---------------------------------------------------------
-- FIN 20260929000002_fix_media_vianda_text.sql
-- ---------------------------------------------------------