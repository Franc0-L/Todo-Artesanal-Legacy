-- Todo-Artesanal
-- 20260921000002_conectar_menus_semana.sql

create or replace view public.vista_uso_menus
with (security_invoker = true)
as
select
  m.id,
  m.nombre,
  m.clima,
  m.activo,
  pp.categoria as categoria_principal,
  m.creado_en,
  m.actualizado_en,

  count(distinct dm_general.id)
    + count(distinct dm_opcional.id) as veces_usado,

  greatest(
    max(dm_general.fecha),
    max(dm_opcional.fecha)
  ) as ultima_vez_usado

from public.menus m

left join public.menu_componentes mcp
  on mcp.menu_id = m.id and mcp.rol = 'principal'
left join public.platos pp
  on pp.id = mcp.plato_id

left join public.dias_menu dm_general
  on dm_general.menu_general_id = m.id

left join public.dias_menu dm_opcional
  on dm_opcional.menu_opcional_id = m.id

where m.tipo = 'semanal'

group by
  m.id, m.nombre, m.clima, m.activo, pp.categoria, m.creado_en, m.actualizado_en;


create or replace function private.crear_menu_trivial_para_plato()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.resolver_menu_trivial(new.id);
  return new;
end;
$$;

drop trigger if exists platos_crear_menu_trivial on public.platos;
create trigger platos_crear_menu_trivial
after insert on public.platos
for each row execute function private.crear_menu_trivial_para_plato();


create or replace function public.crear_semana(
  p_fecha_inicio date,
  p_precio_general numeric,
  p_precio_opcional numeric,
  p_dias jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_semana_id uuid;
  v_dia jsonb;
  v_count integer;
  v_fecha date;
  v_dia_semana text;
  v_menu_general uuid;
  v_menu_opcional uuid;
begin

  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  if extract(isodow from p_fecha_inicio) <> 1 then
    raise exception 'La fecha de inicio debe ser un lunes';
  end if;

  if p_precio_general < 0
     or p_precio_opcional < 0 then
    raise exception 'Los precios no pueden ser negativos';
  end if;

  if jsonb_typeof(p_dias) <> 'array' then
    raise exception 'p_dias debe ser un array';
  end if;

  select count(*)
  into v_count
  from jsonb_array_elements(p_dias);

  if v_count <> 5 then
    raise exception 'La semana debe tener exactamente 5 días';
  end if;

  update public.semanas
  set activa = false
  where activa = true;

  insert into public.semanas (
    fecha_inicio,
    activa,
    precio_general,
    precio_opcional
  )
  values (
    p_fecha_inicio,
    true,
    p_precio_general,
    p_precio_opcional
  )
  returning id into v_semana_id;

  for v_dia in
    select *
    from jsonb_array_elements(p_dias)
  loop

    v_dia_semana := v_dia->>'dia_semana';
    v_fecha := (v_dia->>'fecha')::date;
    v_menu_general := (v_dia->>'menu_general_id')::uuid;
    v_menu_opcional := (v_dia->>'menu_opcional_id')::uuid;

    if v_dia_semana not in (
      'lunes', 'martes', 'miercoles', 'jueves', 'viernes'
    ) then
      raise exception
        'Día de semana inválido: %',
        v_dia_semana;
    end if;

    if v_fecha <> p_fecha_inicio + (
      case v_dia_semana
        when 'lunes' then 0
        when 'martes' then 1
        when 'miercoles' then 2
        when 'jueves' then 3
        when 'viernes' then 4
      end
    ) then
      raise exception
        'La fecha no coincide con el día de semana';
    end if;

    if v_menu_general is null
       or v_menu_opcional is null then
      raise exception
        'Cada día debe tener ambos menús';
    end if;

    if v_menu_general = v_menu_opcional then
      raise exception
        'Los menús general y opcional deben ser distintos';
    end if;

    if not exists (
      select 1
      from public.menus
      where id = v_menu_general
        and tipo = 'semanal'
        and activo = true
    ) then
      raise exception
        'El menú general no existe o está inactivo';
    end if;

    if not exists (
      select 1
      from public.menus
      where id = v_menu_opcional
        and tipo = 'semanal'
        and activo = true
    ) then
      raise exception
        'El menú opcional no existe o está inactivo';
    end if;

    insert into public.dias_menu (
      semana_id,
      dia_semana,
      fecha,
      menu_general_id,
      menu_opcional_id
    )
    values (
      v_semana_id,
      v_dia_semana,
      v_fecha,
      v_menu_general,
      v_menu_opcional
    );

  end loop;

  return v_semana_id;
end;
$$;

grant select on public.vista_uso_menus to authenticated;
