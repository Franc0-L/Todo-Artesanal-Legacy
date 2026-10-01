-- Rollback manual de 20260926000001_week_option_unique_product_per_week.sql
-- Ejecutar solo si se decide revertir esa migración.
--
-- IMPORTANTE: la migración original eliminó un duplicado existente de
-- week_day_options porque no tenía pedidos. El rollback del dato requiere
-- conocer el week_day_id exacto de ese registro antes de restaurarlo.

begin;

drop trigger if exists trg_validate_week_day_option_product_uniqueness
on public.week_day_options;

drop function if exists public.validate_week_day_option_product_uniqueness();

-- La fila eliminada fue:
--   id              = ee4776b4-d5e5-4266-aed2-79edbba2fe5d
--   option_type     = menu
--   menu_version_id = 0e3d68a0-40b3-48e6-a0c4-6278864c57fb
--
-- Restaurarla manualmente después de verificar el week_day_id original:
--
-- insert into public.week_day_options (
--   id, week_day_id, option_type, dish_version_id, menu_version_id
-- ) values (
--   'ee4776b4-d5e5-4266-aed2-79edbba2fe5d',
--   '<WEEK_DAY_ID_ORIGINAL>',
--   'menu',
--   null,
--   '0e3d68a0-40b3-48e6-a0c4-6278864c57fb'
-- );

-- Restaurar activate_week a la versión anterior a esta migración.
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

commit;
