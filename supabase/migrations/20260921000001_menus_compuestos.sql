-- Todo-Artesanal-Legacy
-- 20260921000001_menus_compuestos.sql

create or replace view public.vista_menus_compuestos
with (security_invoker = true)
as
select
  m.id,
  m.nombre,
  m.tipo,
  m.clima,
  m.activo,
  m.creado_en,
  m.actualizado_en,
  pp.nombre as principal_nombre,
  pg.nombre as guarnicion_nombre

from public.menus m

left join public.menu_componentes mcp
  on mcp.menu_id = m.id and mcp.rol = 'principal'
left join public.platos pp
  on pp.id = mcp.plato_id

left join public.menu_componentes mcg
  on mcg.menu_id = m.id and mcg.rol = 'guarnicion'
left join public.platos pg
  on pg.id = mcg.plato_id

where m.plato_unico_id is null;


create or replace function public.crear_menu_compuesto(
  p_nombre text,
  p_clima text,
  p_principal_id uuid,
  p_guarnicion_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_menu_id uuid;
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'El menú necesita un nombre';
  end if;

  if p_clima not in ('cualquiera', 'frio', 'templado', 'calor') then
    raise exception 'Clima inválido';
  end if;

  if p_principal_id is null or p_guarnicion_id is null then
    raise exception 'Elegí un plato principal y una guarnición';
  end if;

  if p_principal_id = p_guarnicion_id then
    raise exception 'El principal y la guarnición deben ser platos distintos';
  end if;

  if not exists (
    select 1 from public.platos
    where id = p_principal_id and activo = true
  ) then
    raise exception 'El plato principal no existe o está inactivo';
  end if;

  if not exists (
    select 1 from public.platos
    where id = p_guarnicion_id and activo = true
  ) then
    raise exception 'La guarnición no existe o está inactiva';
  end if;

  insert into public.menus (nombre, tipo, clima)
  values (trim(p_nombre), 'semanal', p_clima)
  returning id into v_menu_id;

  insert into public.menu_componentes (menu_id, plato_id, rol)
  values
    (v_menu_id, p_principal_id, 'principal'),
    (v_menu_id, p_guarnicion_id, 'guarnicion');

  return v_menu_id;
end;
$$;

grant select on public.vista_menus_compuestos to authenticated;
grant execute on function public.crear_menu_compuesto(text, text, uuid, uuid) to authenticated;
revoke execute on function public.crear_menu_compuesto(text, text, uuid, uuid) from public, anon;
