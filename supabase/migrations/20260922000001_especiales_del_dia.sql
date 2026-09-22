-- Todo-Artesanal-Legacy
-- 20260922000001_especiales_del_dia.sql

alter table public.dias_menu
  add column if not exists menu_especial_id uuid references public.menus(id);

create index if not exists dias_menu_menu_especial_id_idx
  on public.dias_menu (menu_especial_id);


alter table public.pedido_items
  drop constraint if exists pedido_items_pedido_menu_unique;

alter table public.pedido_items
  add constraint pedido_items_pedido_menu_unique
  unique (pedido_id, menu_id);


create or replace function public.crear_menu_especial(
  p_nombre text,
  p_precio_base numeric
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
    raise exception 'El especial necesita un nombre';
  end if;

  if p_precio_base is null or p_precio_base < 0 then
    raise exception 'El precio base no puede ser negativo';
  end if;

  insert into public.menus (nombre, tipo, precio_base)
  values (trim(p_nombre), 'especial', p_precio_base)
  returning id into v_menu_id;

  return v_menu_id;
end;
$$;


create or replace function public.asignar_especial_dia(
  p_dia_menu_id uuid,
  p_menu_especial_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_menu_especial_id is not null and not exists (
    select 1
    from public.menus
    where id = p_menu_especial_id
      and tipo = 'especial'
      and activo = true
  ) then
    raise exception 'El especial no existe o está inactivo';
  end if;

  update public.dias_menu
  set menu_especial_id = p_menu_especial_id
  where id = p_dia_menu_id;

  if not found then
    raise exception 'Día inválido';
  end if;
end;
$$;


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
  v_menu_especial uuid;
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
    v_menu_especial := (v_dia->>'menu_especial_id')::uuid;

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
        and plato_unico_id is null
    ) then
      raise exception
        'El menú general no existe, está inactivo o no es un menú compuesto';
    end if;

    if not exists (
      select 1
      from public.menus
      where id = v_menu_opcional
        and tipo = 'semanal'
        and activo = true
        and plato_unico_id is null
    ) then
      raise exception
        'El menú opcional no existe, está inactivo o no es un menú compuesto';
    end if;

    if v_menu_especial is not null and not exists (
      select 1
      from public.menus
      where id = v_menu_especial
        and tipo = 'especial'
        and activo = true
    ) then
      raise exception
        'El especial no existe o está inactivo';
    end if;

    insert into public.dias_menu (
      semana_id,
      dia_semana,
      fecha,
      menu_general_id,
      menu_opcional_id,
      menu_especial_id
    )
    values (
      v_semana_id,
      v_dia_semana,
      v_fecha,
      v_menu_general,
      v_menu_opcional,
      v_menu_especial
    );

  end loop;

  return v_semana_id;
end;
$$;


drop function if exists public.get_client_menu(text);

create or replace function public.get_client_menu(
  p_token text
)
returns table (
  cliente_nombre text,
  semana_inicio date,
  dia_menu_id uuid,
  dia_semana text,
  fecha date,
  plato_general text,
  plato_general_clima text,
  plato_opcional text,
  plato_opcional_clima text,
  eleccion_actual text,
  especial_menu_id uuid,
  especial_nombre text,
  especial_precio numeric,
  especial_cantidad_actual integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.nombre,
    s.fecha_inicio,
    dm.id,
    dm.dia_semana,
    dm.fecha,
    mg.nombre,
    mg.clima,
    mo.nombre,
    mo.clima,

    case
      when p.estado = 'no_come' then 'no_come'
      when pi_principal.menu_id = dm.menu_general_id then 'general'
      when pi_principal.menu_id = dm.menu_opcional_id then 'opcional'
    end,

    me.id,
    me.nombre,
    coalesce(pec.precio, me.precio_base),
    pi_especial.cantidad

  from public.clientes c

  join public.semanas s
    on s.activa = true

  join public.dias_menu dm
    on dm.semana_id = s.id

  join public.menus mg
    on mg.id = dm.menu_general_id

  join public.menus mo
    on mo.id = dm.menu_opcional_id

  left join public.menus me
    on me.id = dm.menu_especial_id

  left join public.precios_especiales_cliente pec
    on pec.cliente_id = c.id
    and pec.menu_id = dm.menu_especial_id

  left join public.pedidos p
    on p.cliente_id = c.id
    and p.dia_menu_id = dm.id

  left join public.pedido_items pi_principal
    on pi_principal.pedido_id = p.id
    and pi_principal.menu_id in (dm.menu_general_id, dm.menu_opcional_id)

  left join public.pedido_items pi_especial
    on pi_especial.pedido_id = p.id
    and pi_especial.menu_id = dm.menu_especial_id

  where c.token = p_token
    and c.activo = true

  order by dm.fecha;
$$;


create or replace function public.submit_especial(
  p_token text,
  p_dia_menu_id uuid,
  p_cantidad integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_menu_especial_id uuid;
  v_precio numeric(10,2);
begin
  select id into v_cliente_id
  from public.clientes
  where token = p_token and activo = true;

  if v_cliente_id is null then
    raise exception 'Cliente invalido';
  end if;

  select dm.menu_especial_id into v_menu_especial_id
  from public.dias_menu dm
  join public.semanas s on s.id = dm.semana_id and s.activa = true
  where dm.id = p_dia_menu_id;

  if v_menu_especial_id is null then
    raise exception 'Este día no tiene un especial disponible';
  end if;

  select id into v_pedido_id
  from public.pedidos
  where cliente_id = v_cliente_id
    and dia_menu_id = p_dia_menu_id
    and estado = 'respondido';

  if v_pedido_id is null then
    raise exception 'Elegí primero tu general u opcional de ese día';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    delete from public.pedido_items
    where pedido_id = v_pedido_id
      and menu_id = v_menu_especial_id;
    return v_pedido_id;
  end if;

  select coalesce(pec.precio, m.precio_base)
  into v_precio
  from public.menus m
  left join public.precios_especiales_cliente pec
    on pec.cliente_id = v_cliente_id and pec.menu_id = m.id
  where m.id = v_menu_especial_id;

  insert into public.pedido_items (
    pedido_id, menu_id, cantidad, precio_unitario_aplicado, monto_aplicado
  )
  values (
    v_pedido_id, v_menu_especial_id, p_cantidad, v_precio, v_precio * p_cantidad
  )
  on conflict (pedido_id, menu_id)
  do update set
    cantidad = excluded.cantidad,
    precio_unitario_aplicado = excluded.precio_unitario_aplicado,
    monto_aplicado = excluded.monto_aplicado,
    actualizado_en = now();

  return v_pedido_id;
end;
$$;


create or replace function public.admin_set_especial(
  p_cliente_id uuid,
  p_dia_menu_id uuid,
  p_cantidad integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_menu_especial_id uuid;
  v_precio numeric(10,2);
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  select menu_especial_id into v_menu_especial_id
  from public.dias_menu
  where id = p_dia_menu_id;

  if v_menu_especial_id is null then
    raise exception 'Este día no tiene un especial asignado';
  end if;

  select id into v_pedido_id
  from public.pedidos
  where cliente_id = p_cliente_id
    and dia_menu_id = p_dia_menu_id
    and estado = 'respondido';

  if v_pedido_id is null then
    raise exception 'El cliente todavía no eligió su general u opcional ese día';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    delete from public.pedido_items
    where pedido_id = v_pedido_id
      and menu_id = v_menu_especial_id;
    return v_pedido_id;
  end if;

  select coalesce(pec.precio, m.precio_base)
  into v_precio
  from public.menus m
  left join public.precios_especiales_cliente pec
    on pec.cliente_id = p_cliente_id and pec.menu_id = m.id
  where m.id = v_menu_especial_id;

  insert into public.pedido_items (
    pedido_id, menu_id, cantidad, precio_unitario_aplicado, monto_aplicado
  )
  values (
    v_pedido_id, v_menu_especial_id, p_cantidad, v_precio, v_precio * p_cantidad
  )
  on conflict (pedido_id, menu_id)
  do update set
    cantidad = excluded.cantidad,
    precio_unitario_aplicado = excluded.precio_unitario_aplicado,
    monto_aplicado = excluded.monto_aplicado,
    actualizado_en = now();

  return v_pedido_id;
end;
$$;


create or replace view public.vista_pedidos_semana
with (security_invoker = true)
as
select
  p.id as pedido_id,
  p.cliente_id,
  c.nombre as cliente_nombre,
  c.email as cliente_email,
  c.telefono as cliente_telefono,
  dm.semana_id,
  s.fecha_inicio as semana_inicio,
  dm.id as dia_menu_id,
  dm.dia_semana,
  dm.fecha,

  case
    when p.estado = 'no_come' then 'no_come'
    when pi.menu_id = dm.menu_general_id then 'general'
    when pi.menu_id = dm.menu_opcional_id then 'opcional'
    when pi.menu_id is not null then 'especial'
  end as tipo_menu,

  m.nombre as plato,
  m.clima as clima,

  p.creado_en,
  p.actualizado_en,
  coalesce(pi.monto_aplicado, 0)::numeric as monto,
  coalesce(pi.cantidad, 0) as cantidad

from public.pedidos p
join public.clientes c
  on c.id = p.cliente_id
join public.dias_menu dm
  on dm.id = p.dia_menu_id
join public.semanas s
  on s.id = dm.semana_id
left join public.pedido_items pi
  on pi.pedido_id = p.id
left join public.menus m
  on m.id = pi.menu_id;

grant select on public.vista_pedidos_semana to authenticated;

grant execute on function public.crear_menu_especial(text, numeric) to authenticated;
revoke execute on function public.crear_menu_especial(text, numeric) from public, anon;

grant execute on function public.asignar_especial_dia(uuid, uuid) to authenticated;
revoke execute on function public.asignar_especial_dia(uuid, uuid) from public, anon;

grant execute on function public.admin_set_especial(uuid, uuid, integer) to authenticated;
revoke execute on function public.admin_set_especial(uuid, uuid, integer) from public, anon;

revoke execute on function public.submit_especial(text, uuid, integer) from public, authenticated;
grant execute on function public.submit_especial(text, uuid, integer) to anon;

revoke execute on function public.get_client_menu(text) from public, authenticated;
grant execute on function public.get_client_menu(text) to anon;
