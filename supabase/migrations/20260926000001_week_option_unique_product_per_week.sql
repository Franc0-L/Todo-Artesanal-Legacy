-- =========================================================
-- Todo Artesanal — Fase 6
-- 20260926000001_week_option_unique_product_per_week.sql
--
-- Impide que el mismo plato o menú lógico aparezca en dos días
-- distintos de una misma semana.
--
-- La identidad se toma desde dish_versions.dish_id / menu_versions.menu_id,
-- no desde la versión concreta. Así cambiar de versión no permite repetir
-- el mismo producto dentro de la semana.
--
-- La validación se hace en trigger y también en activate_week como defensa
-- adicional. El trigger usa un advisory lock transaccional por semana para
-- cerrar la ventana de carrera entre dos escrituras concurrentes.
-- =========================================================

-- Limpieza del único duplicado existente al momento de crear la migración.
-- El registro posterior no tenía pedidos asociados.
delete from public.week_day_options wdo
using public.week_days wd
where wdo.id = 'ee4776b4-d5e5-4266-aed2-79edbba2fe5d'
  and wd.id = wdo.week_day_id
  and wd.week_id = '5d0c25f5-02c9-49a8-8aeb-334371a01585';

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

create or replace function public.activate_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_day_count integer;
  v_empty_day_count integer;
  v_invalid_menu_count integer;
  v_duplicate_dish_count integer;
  v_duplicate_menu_count integer;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores pueden activar semanas';
  end if;

  select w.status into v_status from public.weeks w where w.id = p_week_id;
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

  select count(*) into v_empty_day_count
  from public.week_days wd
  where wd.week_id = p_week_id
    and not exists (select 1 from public.week_day_options wdo where wdo.week_day_id = wd.id);
  if v_empty_day_count > 0 then
    raise exception 'No se puede activar la semana: existen % días sin opciones de oferta', v_empty_day_count;
  end if;

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
