-- Todo-Artesanal
-- 20260917000002_functions.sql

create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;


drop trigger if exists clientes_set_actualizado_en
on public.clientes;

create trigger clientes_set_actualizado_en
before update on public.clientes
for each row
execute function public.set_actualizado_en();


drop trigger if exists semanas_set_actualizado_en
on public.semanas;

create trigger semanas_set_actualizado_en
before update on public.semanas
for each row
execute function public.set_actualizado_en();


drop trigger if exists platos_set_actualizado_en
on public.platos;

create trigger platos_set_actualizado_en
before update on public.platos
for each row
execute function public.set_actualizado_en();


drop trigger if exists pedidos_set_actualizado_en
on public.pedidos;

create trigger pedidos_set_actualizado_en
before update on public.pedidos
for each row
execute function public.set_actualizado_en();


create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_users
    where user_id = auth.uid()
  );
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
  v_general uuid;
  v_opcional uuid;
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
    v_general := (v_dia->>'plato_general_id')::uuid;
    v_opcional := (v_dia->>'plato_opcional_id')::uuid;

    if v_dia_semana not in (
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes'
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

    if v_general is null
       or v_opcional is null then
      raise exception
        'Cada día debe tener ambos platos';
    end if;

    if v_general = v_opcional then
      raise exception
        'Los platos general y opcional deben ser distintos';
    end if;

    if not exists (
      select 1
      from public.platos
      where id = v_general
        and activo = true
    ) then
      raise exception
        'El plato general no existe o está inactivo';
    end if;

    if not exists (
      select 1
      from public.platos
      where id = v_opcional
        and activo = true
    ) then
      raise exception
        'El plato opcional no existe o está inactivo';
    end if;

    insert into public.dias_menu (
      semana_id,
      dia_semana,
      fecha,
      plato_general_id,
      plato_opcional_id
    )
    values (
      v_semana_id,
      v_dia_semana,
      v_fecha,
      v_general,
      v_opcional
    );

  end loop;

  return v_semana_id;
end;
$$;


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
  eleccion_actual text
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
    pg.nombre,
    pg.clima,
    po.nombre,
    po.clima,
    p.tipo_menu

  from public.clientes c

  join public.semanas s
    on s.activa = true

  join public.dias_menu dm
    on dm.semana_id = s.id

  join public.platos pg
    on pg.id = dm.plato_general_id

  join public.platos po
    on po.id = dm.plato_opcional_id

  left join public.pedidos p
    on p.cliente_id = c.id
    and p.dia_menu_id = dm.id

  where c.token = p_token
    and c.activo = true

  order by dm.fecha;
$$;


create or replace function public.submit_order(
  p_token text,
  p_dia_menu_id uuid,
  p_tipo_menu text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_semana_id uuid;
  v_pedido_id uuid;
begin

  if p_tipo_menu not in (
    'general',
    'opcional',
    'no_come'
  ) then
    raise exception 'Tipo de menú inválido';
  end if;

  select id
  into v_cliente_id
  from public.clientes
  where token = p_token
    and activo = true;

  if v_cliente_id is null then
    raise exception 'Cliente inválido';
  end if;

  select dm.semana_id
  into v_semana_id
  from public.dias_menu dm
  join public.semanas s
    on s.id = dm.semana_id
  where dm.id = p_dia_menu_id
    and s.activa = true;

  if v_semana_id is null then
    raise exception
      'El día no pertenece a la semana activa';
  end if;

  perform 1
  from public.semanas
  where id = v_semana_id
    and activa = true
  for update;

  insert into public.pedidos (
    cliente_id,
    dia_menu_id,
    tipo_menu
  )
  values (
    v_cliente_id,
    p_dia_menu_id,
    p_tipo_menu
  )

  on conflict (
    cliente_id,
    dia_menu_id
  )

  do update set
    tipo_menu = excluded.tipo_menu,
    actualizado_en = now()

  returning id into v_pedido_id;

  return v_pedido_id;
end;
$$;