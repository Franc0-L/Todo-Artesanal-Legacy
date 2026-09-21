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

drop trigger if exists clientes_set_actualizado_en on public.clientes;
create trigger clientes_set_actualizado_en
before update on public.clientes
for each row execute function public.set_actualizado_en();

drop trigger if exists semanas_set_actualizado_en on public.semanas;
create trigger semanas_set_actualizado_en
before update on public.semanas
for each row execute function public.set_actualizado_en();

drop trigger if exists platos_set_actualizado_en on public.platos;
create trigger platos_set_actualizado_en
before update on public.platos
for each row execute function public.set_actualizado_en();

drop trigger if exists menus_set_actualizado_en on public.menus;
create trigger menus_set_actualizado_en
before update on public.menus
for each row execute function public.set_actualizado_en();

drop trigger if exists pedidos_set_actualizado_en on public.pedidos;
create trigger pedidos_set_actualizado_en
before update on public.pedidos
for each row execute function public.set_actualizado_en();

drop trigger if exists pedido_items_set_actualizado_en on public.pedido_items;
create trigger pedido_items_set_actualizado_en
before update on public.pedido_items
for each row execute function public.set_actualizado_en();


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


create or replace function private.resolver_menu_trivial(
  p_plato_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_menu_id uuid;
begin
  insert into public.menus (nombre, tipo, clima, plato_unico_id)
  select pl.nombre, 'semanal', pl.clima, pl.id
  from public.platos pl
  where pl.id = p_plato_id
  on conflict (plato_unico_id) where plato_unico_id is not null
  do nothing;

  select id
  into v_menu_id
  from public.menus
  where plato_unico_id = p_plato_id;

  insert into public.menu_componentes (menu_id, plato_id, rol)
  values (v_menu_id, p_plato_id, 'principal')
  on conflict (menu_id, rol) do nothing;

  return v_menu_id;
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
  v_plato_general uuid;
  v_plato_opcional uuid;
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
    v_plato_general := (v_dia->>'plato_general_id')::uuid;
    v_plato_opcional := (v_dia->>'plato_opcional_id')::uuid;

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

    if v_plato_general is null
       or v_plato_opcional is null then
      raise exception
        'Cada día debe tener ambos platos';
    end if;

    if v_plato_general = v_plato_opcional then
      raise exception
        'Los platos general y opcional deben ser distintos';
    end if;

    if not exists (
      select 1
      from public.platos
      where id = v_plato_general
        and activo = true
    ) then
      raise exception
        'El plato general no existe o está inactivo';
    end if;

    if not exists (
      select 1
      from public.platos
      where id = v_plato_opcional
        and activo = true
    ) then
      raise exception
        'El plato opcional no existe o está inactivo';
    end if;

    v_menu_general := private.resolver_menu_trivial(v_plato_general);
    v_menu_opcional := private.resolver_menu_trivial(v_plato_opcional);

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
    mg.nombre,
    mg.clima,
    mo.nombre,
    mo.clima,

    case
      when p.estado = 'no_come' then 'no_come'
      when pi.menu_id = dm.menu_general_id then 'general'
      when pi.menu_id = dm.menu_opcional_id then 'opcional'
    end

  from public.clientes c

  join public.semanas s
    on s.activa = true

  join public.dias_menu dm
    on dm.semana_id = s.id

  join public.menus mg
    on mg.id = dm.menu_general_id

  join public.menus mo
    on mo.id = dm.menu_opcional_id

  left join public.pedidos p
    on p.cliente_id = c.id
    and p.dia_menu_id = dm.id

  left join public.pedido_items pi
    on pi.pedido_id = p.id

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
  v_menu_id uuid;
  v_monto numeric(10,2);
begin
  if p_tipo_menu not in ('general', 'opcional') then
    raise exception 'Tipo de menu invalido';
  end if;

  select id into v_cliente_id
  from public.clientes
  where token = p_token and activo = true;

  if v_cliente_id is null then
    raise exception 'Cliente invalido';
  end if;

  select
    dm.semana_id,
    case
      when p_tipo_menu = 'general' then dm.menu_general_id
      else dm.menu_opcional_id
    end,
    case
      when p_tipo_menu = 'general'
        then coalesce(c.precio_general_especial, s.precio_general)
      else coalesce(c.precio_opcional_especial, s.precio_opcional)
    end
  into v_semana_id, v_menu_id, v_monto
  from public.dias_menu dm
  join public.semanas s on s.id = dm.semana_id and s.activa = true
  join public.clientes c on c.id = v_cliente_id
  where dm.id = p_dia_menu_id;

  if v_semana_id is null then
    raise exception 'El dia no pertenece a la semana activa';
  end if;

  insert into public.pedidos (cliente_id, dia_menu_id, estado)
  values (v_cliente_id, p_dia_menu_id, 'respondido')
  on conflict (cliente_id, dia_menu_id)
  do update set
    estado = 'respondido',
    actualizado_en = now()
  returning id into v_pedido_id;

  delete from public.pedido_items
  where pedido_id = v_pedido_id;

  insert into public.pedido_items (
    pedido_id,
    menu_id,
    cantidad,
    precio_unitario_aplicado,
    monto_aplicado
  )
  values (
    v_pedido_id,
    v_menu_id,
    1,
    v_monto,
    v_monto
  );

  return v_pedido_id;
end;
$$;


create or replace function public.cancel_order(
  p_token text,
  p_dia_menu_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_pedido_id uuid;
begin
  select id into v_cliente_id
  from public.clientes
  where token = p_token and activo = true;

  if v_cliente_id is null then
    raise exception 'Cliente invalido';
  end if;

  if not exists (
    select 1
    from public.dias_menu dm
    join public.semanas s on s.id = dm.semana_id
    where dm.id = p_dia_menu_id and s.activa = true
  ) then
    raise exception 'El dia no pertenece a la semana activa';
  end if;

  insert into public.pedidos (cliente_id, dia_menu_id, estado)
  values (v_cliente_id, p_dia_menu_id, 'no_come')
  on conflict (cliente_id, dia_menu_id)
  do update set
    estado = 'no_come',
    actualizado_en = now()
  returning id into v_pedido_id;

  delete from public.pedido_items
  where pedido_id = v_pedido_id;

  return v_pedido_id;
end;
$$;


create or replace function public.admin_set_order(
  p_cliente_id uuid,
  p_dia_menu_id uuid,
  p_tipo_menu text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_menu_id uuid;
  v_monto numeric(10,2);
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_tipo_menu is not null and p_tipo_menu not in ('general', 'opcional', 'no_come') then
    raise exception 'Tipo de menu invalido';
  end if;

  if p_tipo_menu is null then
    delete from public.pedidos
    where cliente_id = p_cliente_id
      and dia_menu_id = p_dia_menu_id;
    return null;
  end if;

  if p_tipo_menu = 'no_come' then
    insert into public.pedidos (cliente_id, dia_menu_id, estado)
    values (p_cliente_id, p_dia_menu_id, 'no_come')
    on conflict (cliente_id, dia_menu_id)
    do update set
      estado = 'no_come',
      actualizado_en = now()
    returning id into v_pedido_id;

    delete from public.pedido_items
    where pedido_id = v_pedido_id;

    return v_pedido_id;
  end if;

  select
    case
      when p_tipo_menu = 'general' then dm.menu_general_id
      else dm.menu_opcional_id
    end,
    case
      when p_tipo_menu = 'general'
        then coalesce(c.precio_general_especial, s.precio_general)
      else coalesce(c.precio_opcional_especial, s.precio_opcional)
    end
  into v_menu_id, v_monto
  from public.clientes c
  join public.dias_menu dm on dm.id = p_dia_menu_id
  join public.semanas s on s.id = dm.semana_id
  where c.id = p_cliente_id;

  if v_menu_id is null then
    raise exception 'Cliente o dia de menu invalido';
  end if;

  insert into public.pedidos (cliente_id, dia_menu_id, estado)
  values (p_cliente_id, p_dia_menu_id, 'respondido')
  on conflict (cliente_id, dia_menu_id)
  do update set
    estado = 'respondido',
    actualizado_en = now()
  returning id into v_pedido_id;

  delete from public.pedido_items
  where pedido_id = v_pedido_id;

  insert into public.pedido_items (
    pedido_id,
    menu_id,
    cantidad,
    precio_unitario_aplicado,
    monto_aplicado
  )
  values (
    v_pedido_id,
    v_menu_id,
    1,
    v_monto,
    v_monto
  );

  return v_pedido_id;
end;
$$;


create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.es_admin();
$$;


create or replace function public.rotate_client_token(
  p_cliente_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  update public.clientes
  set token = v_token
  where id = p_cliente_id;

  if not found then
    raise exception 'Cliente invalido';
  end if;

  return v_token;
end;
$$;
