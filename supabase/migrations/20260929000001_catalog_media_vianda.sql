-- =========================================================
-- Todo Artesanal
-- 20260929000001_catalog_media_vianda.sql
--
-- Permite que una media vianda apunte a cualquier plato o menú del
-- catálogo, no solo a la oferta General/Opcional del día.
--
-- Revierte parcialmente la regla documentada en
-- docs/decisiones/20260926-oferta-general-opcional.md.
--
-- General/Opcional no cambian: siguen tomando modalidad y precio de la
-- opción de oferta (week_day_option_id obligatorio).
--
-- Cambios:
--   1. orders.week_day_id — el pedido pertenece a un día. Antes el día
--      se derivaba indirectamente vía week_day_options; con la media
--      vianda de catálogo esa vía deja de existir.
--   2. orders.week_day_option_id pasa a nullable.
--   3. orders.dish_version_id / orders.menu_version_id — producto de
--      catálogo para la media vianda libre.
--   4. CHECK de fuente de producto único según modalidad.
--   5. calculate_catalog_media_vianda_price() — 50% del precio normal.
--   6. validate_order y los triggers de protección leen el día desde
--      orders.week_day_id.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------

alter table public.orders
  add column week_day_id uuid references public.week_days(id),
  add column dish_version_id uuid references public.dish_versions(id),
  add column menu_version_id uuid references public.menu_versions(id);

-- ---------------------------------------------------------
-- 2. Backfill del día para los pedidos existentes
-- ---------------------------------------------------------

update public.orders o
set week_day_id = wd.id
from public.week_day_options wdo
join public.week_days wd on wd.id = wdo.week_day_id
where wdo.id = o.week_day_option_id
  and o.week_day_id is null;

do $$
begin
  if exists (select 1 from public.orders where week_day_id is null) then
    raise exception 'No se pudo resolver el día de todos los pedidos existentes';
  end if;
end;
$$;

alter table public.orders alter column week_day_id set not null;

-- ---------------------------------------------------------
-- 3. La opción de oferta deja de ser obligatoria
-- ---------------------------------------------------------

alter table public.orders alter column week_day_option_id drop not null;

-- ---------------------------------------------------------
-- 4. Exactamente una fuente de producto según la modalidad
-- ---------------------------------------------------------

alter table public.orders
  add constraint orders_product_source_check check (
    case modality
      when 'media_vianda' then
        (week_day_option_id is not null)::int
        + (dish_version_id is not null)::int
        + (menu_version_id is not null)::int = 1
      else
        week_day_option_id is not null
        and dish_version_id is null
        and menu_version_id is null
    end
  );

-- ---------------------------------------------------------
-- 5. Índices
--    La unicidad (client_id, week_day_option_id, modality) no cubre la
--    media vianda de catálogo (week_day_option_id NULL): se agregan
--    índices únicos parciales por producto y día.
-- ---------------------------------------------------------

create index if not exists orders_week_day_id_idx
  on public.orders (week_day_id);

create index if not exists orders_dish_version_id_idx
  on public.orders (dish_version_id)
  where dish_version_id is not null;

create index if not exists orders_menu_version_id_idx
  on public.orders (menu_version_id)
  where menu_version_id is not null;

create unique index if not exists orders_catalog_dish_unique
  on public.orders (client_id, week_day_id, dish_version_id)
  where dish_version_id is not null;

create unique index if not exists orders_catalog_menu_unique
  on public.orders (client_id, week_day_id, menu_version_id)
  where menu_version_id is not null;
-- ---------------------------------------------------------
-- 6. Precio de la media vianda desde el catálogo
--    Mismo criterio que calculate_order_price:
--      plato: precio específico del plato > general del cliente > base
--      menú:  general del cliente > base
--    y siempre la mitad del precio normal.
-- ---------------------------------------------------------

create or replace function public.calculate_catalog_media_vianda_price(
  p_client_id uuid,
  p_dish_version_id uuid,
  p_menu_version_id uuid
)
returns numeric(10,2)
language plpgsql
security definer
set search_path = public, private
as $$
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

-- Igual que calculate_order_price: la invocan los triggers, no el cliente.
revoke all on function public.calculate_catalog_media_vianda_price(
  uuid,
  uuid,
  uuid
) from public;

revoke all on function public.calculate_catalog_media_vianda_price(
  uuid,
  uuid,
  uuid
) from authenticated;
-- ---------------------------------------------------------
-- 7. validate_order
--    Unificado para las dos fuentes de producto:
--      - opciÃƒÂ³n de oferta presente -> el dÃƒÂ­a sale de la opciÃƒÂ³n;
--      - media vianda de catÃƒÂ¡logo  -> el dÃƒÂ­a viene en week_day_id.
--    Se conserva la normalizaciÃƒÂ³n de modalidad (General/Opcional los
--    determina la oferta, no quien crea el pedido).
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
        'La opciÃƒÂ³n de dÃƒÂ­a % no existe', new.week_day_option_id;
    end if;

    new.week_day_id := v_week_day_id;
  else
    if new.week_day_id is null then
      raise exception
        'El pedido debe indicar un dÃƒÂ­a de la semana';
    end if;

    select wd.week_id
    into v_week_id
    from public.week_days wd
    where wd.id = new.week_day_id;

    if not found then
      raise exception 'El dÃƒÂ­a % no existe', new.week_day_id;
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
          'Solo la media vianda puede pedirse desde el catÃƒÂ¡logo';
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
-- 8. Triggers de protecciÃ³n
--    Antes resolvÃ­an el dÃ­a vÃ­a week_day_options; la media vianda de
--    catÃ¡logo no tiene opciÃ³n, asÃ­ que ahora usan orders.week_day_id.
--    (create or replace conserva los triggers ya asociados.)
-- ---------------------------------------------------------

create or replace function private.prevent_closed_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
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
      'El cliente tiene una cancelaciÃ³n para ese dÃ­a y no puede registrarse un pedido';
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
      'El cliente ya tiene un pedido para ese dÃ­a y no puede registrarse una cancelaciÃ³n';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------
-- FIN 20260929000001_catalog_media_vianda.sql
-- ---------------------------------------------------------