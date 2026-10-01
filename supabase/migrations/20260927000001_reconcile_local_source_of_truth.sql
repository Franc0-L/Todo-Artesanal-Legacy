-- =========================================================
-- Todo Artesanal v2 — Fase 6
-- 20260927000001_reconcile_local_source_of_truth.sql
--
-- Decisión: docs/decisiones/20260927-local-fuente-de-verdad.md
--   El repo local es la fuente de verdad. Lo aceptado acá pisa lo que
--   haya quedado aplicado en la base remota.
--
-- Por qué existe esta migración:
--   El historial remoto tiene 4 migraciones sin archivo en el repo
--   (20260924131042, 20260924131127, 20260926161458, 20260926165602)
--   y el local tiene 4 sin aplicar (20260924000005, 20260924000006,
--   20260926000001, 20260926170000).
--
--   El orden quedó desfasado: 20260926000001 es *anterior* a
--   20260926165141 (ya aplicada en remoto), así que aplicar el backlog
--   local tal cual haría que su `create or replace function
--   activate_week` pisara la validación "cada día con General +
--   Opcional".
--
-- Esta migración va al final del backlog y fija el estado final
-- canónico, sin importar qué hayan hecho en remoto las migraciones sin
-- archivo. Es idempotente.
--
--   1. public.activate_week = versión fusionada (General/Opcional por
--      día + producto único por semana + 1 main por menú).
--   2. private.validate_order = versión normalizadora (la aceptada en
--      local con 20260926170000).
--   3. Trigger de unicidad de producto por semana.
--   4. Grants de public.is_user_admin (authenticated: sí, anon: no).
--   5. Objetos de week_day_options.offer_modality (idempotentes).
--   6. Limpieza del duplicado conocido, si sigue existiendo y no tiene
--      pedidos.
-- =========================================================

-- ---------------------------------------------------------
-- 1. activate_week — estado final local (fusionado)
--    Base: 20260926165141 (General/Opcional por día) +
--          20260926000001 (producto único por semana).
-- ---------------------------------------------------------

create or replace function public.activate_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
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

-- ---------------------------------------------------------
-- 2. private.validate_order — estado final local
--    Base: 20260926170000 (normaliza en vez de rechazar).
-- ---------------------------------------------------------

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
    raise exception 'La opción de día % no existe', new.week_day_option_id;
  end if;

  select status into v_week_status from public.weeks where id = v_week_id;
  if v_week_status <> 'active' then
    raise exception 'Solo se pueden gestionar pedidos de una semana activa';
  end if;

  select exists (
    select 1 from public.week_expected_clients wec
    where wec.week_id = v_week_id and wec.client_id = new.client_id
  ) into v_expected;
  if not v_expected then
    raise exception 'El cliente % no pertenece a los clientes esperados de la semana', new.client_id;
  end if;

  -- General/Opcional los determina la oferta, no quien crea el pedido.
  if new.modality in ('general', 'opcional') then
    new.modality := v_offer_modality;
  end if;

  if tg_op = 'INSERT' then
    new.applied_price := public.calculate_order_price(new.client_id, new.week_day_option_id, new.modality);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id then
      raise exception 'client_id no puede modificarse en un pedido';
    end if;
    if new.week_day_option_id is distinct from old.week_day_option_id then
      raise exception 'week_day_option_id no puede modificarse en un pedido';
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
-- 3. Unicidad de producto por semana (trigger)
--    Base: 20260926000001.
-- ---------------------------------------------------------

create or replace function public.validate_week_day_option_product_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_id uuid;
  v_product_id uuid;
begin
  select wd.week_id
    into v_week_id
  from public.week_days wd
  where wd.id = new.week_day_id;

  if v_week_id is null then
    raise exception 'El día de la semana % no existe', new.week_day_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_week_id::text, 0));

  if new.option_type = 'dish' then
    select dv.dish_id into v_product_id
    from public.dish_versions dv
    where dv.id = new.dish_version_id;

    if v_product_id is null then
      raise exception 'La versión de plato % no existe', new.dish_version_id;
    end if;

    if exists (
      select 1
      from public.week_day_options other
      join public.week_days other_day on other_day.id = other.week_day_id
      join public.dish_versions other_version on other_version.id = other.dish_version_id
      where other_day.week_id = v_week_id
        and other.option_type = 'dish'
        and other_version.dish_id = v_product_id
        and other.id <> new.id
    ) then
      raise exception 'El plato % ya está utilizado en otro día de esta semana', v_product_id;
    end if;
  elsif new.option_type = 'menu' then
    select mv.menu_id into v_product_id
    from public.menu_versions mv
    where mv.id = new.menu_version_id;

    if v_product_id is null then
      raise exception 'La versión de menú % no existe', new.menu_version_id;
    end if;

    if exists (
      select 1
      from public.week_day_options other
      join public.week_days other_day on other_day.id = other.week_day_id
      join public.menu_versions other_version on other_version.id = other.menu_version_id
      where other_day.week_id = v_week_id
        and other.option_type = 'menu'
        and other_version.menu_id = v_product_id
        and other.id <> new.id
    ) then
      raise exception 'El menú % ya está utilizado en otro día de esta semana', v_product_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_week_day_option_product_uniqueness on public.week_day_options;
create trigger trg_validate_week_day_option_product_uniqueness
before insert or update of week_day_id, option_type, dish_version_id, menu_version_id
on public.week_day_options
for each row
execute function public.validate_week_day_option_product_uniqueness();

-- ---------------------------------------------------------
-- 4. Grants de public.is_user_admin
--    Base: 20260924000005 + 20260924000006.
-- ---------------------------------------------------------

grant execute on function public.is_user_admin(uuid) to authenticated;
grant execute on function public.is_user_admin(uuid) to service_role;
revoke execute on function public.is_user_admin(uuid) from anon;

-- ---------------------------------------------------------
-- 5. week_day_options.offer_modality — objetos garantizados
--    Base: 20260926165141 (ya aplicada; esto es a prueba de
--    cualquier migración remota sin archivo).
-- ---------------------------------------------------------

alter table public.week_day_options
  alter column offer_modality set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'week_day_options_offer_modality_check'
      and conrelid = 'public.week_day_options'::regclass
  ) then
    alter table public.week_day_options
      add constraint week_day_options_offer_modality_check
      check (offer_modality in ('general', 'opcional'));
  end if;
end;
$$;

create unique index if not exists week_day_options_week_day_offer_modality_unique
  on public.week_day_options (week_day_id, offer_modality);

-- ---------------------------------------------------------
-- 6. Limpieza del duplicado conocido
--    Base: 20260926000001. En remoto esa migración nunca corrió,
--    así que el duplicado puede seguir existiendo.
--    Solo se borra si no tiene pedidos (si los tiene, queda y el
--    chequeo de activate_week lo hará visible al intentar activar).
-- ---------------------------------------------------------

delete from public.week_day_options wdo
using public.week_days wd
where wdo.id = 'ee4776b4-d5e5-4266-aed2-79edbba2fe5d'
  and wd.id = wdo.week_day_id
  and wd.week_id = '5d0c25f5-02c9-49a8-8aeb-334371a01585'
  and not exists (
    select 1 from public.orders o where o.week_day_option_id = wdo.id
  );
