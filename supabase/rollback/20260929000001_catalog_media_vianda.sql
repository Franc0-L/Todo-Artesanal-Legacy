-- Rollback: 20260929000001_catalog_media_vianda.sql
--
-- Vuelve a exigir que todo pedido apunte a una opción de oferta y
-- elimina las columnas de la media vianda de catálogo.
--
-- ATENCIÓN: falla si ya existen pedidos de media vianda tomados desde el
-- catálogo (week_day_option_id null), porque no tienen opción a la que
-- volver. Hay que borrarlos o reasignarlos antes de correr esto.

do $$
begin
  if exists (select 1 from public.orders where week_day_option_id is null) then
    raise exception 'Existen pedidos de media vianda de catálogo: no se puede revertir sin borrarlos o reasignarlos';
  end if;
end;
$$;

drop index if exists public.orders_catalog_menu_unique;
drop index if exists public.orders_catalog_dish_unique;
drop index if exists public.orders_menu_version_id_idx;
drop index if exists public.orders_dish_version_id_idx;
drop index if exists public.orders_week_day_id_idx;

alter table public.orders drop constraint if exists orders_product_source_check;

alter table public.orders alter column week_day_option_id set not null;

alter table public.orders
  drop column if exists menu_version_id,
  drop column if exists dish_version_id,
  drop column if exists week_day_id;

drop function if exists public.calculate_catalog_media_vianda_price(uuid, uuid, uuid);

-- Restaurar triggers previos (resolvían el día vía week_day_options).

create or replace function private.prevent_closed_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_option_id uuid;
  v_week_id uuid;
  v_status text;
begin
  if tg_op = ''DELETE'' then
    v_option_id := old.week_day_option_id;
  else
    v_option_id := new.week_day_option_id;
  end if;

  select wd.week_id
  into v_week_id
  from public.week_day_options wdo
  join public.week_days wd on wd.id = wdo.week_day_id
  where wdo.id = v_option_id;

  select w.status into v_status from public.weeks w where w.id = v_week_id;

  if v_status = ''closed'' then
    raise exception ''No se puede modificar un pedido de una semana cerrada'';
  end if;

  if tg_op = ''DELETE'' then
    return old;
  else
    return new;
  end if;
end;
$$;

create or replace function private.prevent_order_with_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_client_id uuid;
  v_option_id uuid;
  v_week_day_id uuid;
begin
  if tg_op = ''DELETE'' then
    return old;
  end if;

  v_client_id := new.client_id;
  v_option_id := new.week_day_option_id;

  select wd.id
  into v_week_day_id
  from public.week_day_options wdo
  join public.week_days wd on wd.id = wdo.week_day_id
  where wdo.id = v_option_id;

  if exists (
    select 1
    from public.cancellations c
    where c.client_id = v_client_id
      and c.week_day_id = v_week_day_id
  ) then
    raise exception
      ''El cliente tiene una cancelación para ese día y no puede registrarse un pedido'';
  end if;

  return new;
end;
$$;

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
  if tg_op = ''DELETE'' then
    return old;
  end if;

  v_client_id := new.client_id;
  v_week_day_id := new.week_day_id;

  if exists (
    select 1
    from public.orders o
    join public.week_day_options wdo on wdo.id = o.week_day_option_id
    where o.client_id = v_client_id
      and wdo.week_day_id = v_week_day_id
  ) then
    raise exception
      ''El cliente ya tiene un pedido para ese día y no puede registrarse una cancelación'';
  end if;

  return new;
end;
$$;

create or replace function private.validate_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_id uuid;
  v_week_status text;
  v_expected boolean;
  v_offer_modality text;
begin
  select wd.week_id, wdo.offer_modality
  into v_week_id, v_offer_modality
  from public.week_day_options wdo
  join public.week_days wd on wd.id = wdo.week_day_id
  where wdo.id = new.week_day_option_id;

  if not found then
    raise exception ''La opción de día % no existe'', new.week_day_option_id;
  end if;

  select status into v_week_status from public.weeks where id = v_week_id;

  if v_week_status <> ''active'' then
    raise exception ''Solo se pueden gestionar pedidos de una semana activa'';
  end if;

  select exists (
    select 1 from public.week_expected_clients wec
    where wec.week_id = v_week_id and wec.client_id = new.client_id
  ) into v_expected;

  if not v_expected then
    raise exception ''El cliente % no pertenece a los clientes esperados de la semana'', new.client_id;
  end if;

  if new.modality in (''general'', ''opcional'') then
    new.modality := v_offer_modality;
  end if;

  if tg_op = ''INSERT'' then
    new.applied_price := public.calculate_order_price(new.client_id, new.week_day_option_id, new.modality);
    return new;
  end if;

  if tg_op = ''UPDATE'' then
    if new.client_id is distinct from old.client_id then
      raise exception ''client_id no puede modificarse en un pedido'';
    end if;
    if new.week_day_option_id is distinct from old.week_day_option_id then
      raise exception ''week_day_option_id no puede modificarse en un pedido'';
    end if;
    if new.modality is distinct from old.modality then
      raise exception ''modality no puede modificarse en un pedido'';
    end if;
    if new.applied_price is distinct from old.applied_price then
      raise exception ''applied_price no puede modificarse en un pedido'';
    end if;
    return new;
  end if;

  return new;
end;
$$;