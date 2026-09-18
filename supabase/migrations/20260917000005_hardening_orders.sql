-- Todo-Artesanal
-- 20260917000005_hardening_orders.sql

alter table public.pedidos
  add column if not exists monto_aplicado numeric(10,2);

alter table public.pedidos
  drop constraint if exists pedidos_monto_aplicado_nonnegative;

alter table public.pedidos
  add constraint pedidos_monto_aplicado_nonnegative
  check (monto_aplicado is null or monto_aplicado >= 0);

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
  p.tipo_menu,

  case
    when p.tipo_menu = 'general' then pg.nombre
    when p.tipo_menu = 'opcional' then po.nombre
  end as plato,

  case
    when p.tipo_menu = 'general' then pg.clima
    when p.tipo_menu = 'opcional' then po.clima
  end as clima,

  p.creado_en,
  p.actualizado_en,

  coalesce(
    p.monto_aplicado,
    case
      when p.tipo_menu = 'general'
        then coalesce(c.precio_general_especial, s.precio_general)
      when p.tipo_menu = 'opcional'
        then coalesce(c.precio_opcional_especial, s.precio_opcional)
      else 0
    end
  ) as monto

from public.pedidos p
join public.clientes c
  on c.id = p.cliente_id
join public.dias_menu dm
  on dm.id = p.dia_menu_id
join public.semanas s
  on s.id = dm.semana_id
join public.platos pg
  on pg.id = dm.plato_general_id
join public.platos po
  on po.id = dm.plato_opcional_id;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.es_admin();
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

  select case
    when p_tipo_menu = 'general'
      then coalesce(c.precio_general_especial, s.precio_general)
    when p_tipo_menu = 'opcional'
      then coalesce(c.precio_opcional_especial, s.precio_opcional)
    else 0
  end
  into v_monto
  from public.clientes c
  join public.dias_menu dm on dm.id = p_dia_menu_id
  join public.semanas s on s.id = dm.semana_id
  where c.id = p_cliente_id;

  if v_monto is null then
    raise exception 'Cliente o dia de menu invalido';
  end if;

  insert into public.pedidos (
    cliente_id,
    dia_menu_id,
    tipo_menu,
    monto_aplicado
  )
  values (
    p_cliente_id,
    p_dia_menu_id,
    p_tipo_menu,
    v_monto
  )
  on conflict (cliente_id, dia_menu_id)
  do update set
    tipo_menu = excluded.tipo_menu,
    monto_aplicado = excluded.monto_aplicado,
    actualizado_en = now()
  returning id into v_pedido_id;

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

  insert into public.pedidos (cliente_id, dia_menu_id, tipo_menu, monto_aplicado)
  values (v_cliente_id, p_dia_menu_id, 'no_come', 0)
  on conflict (cliente_id, dia_menu_id)
  do update set
    tipo_menu = 'no_come',
    monto_aplicado = 0,
    actualizado_en = now()
  returning id into v_pedido_id;

  return v_pedido_id;
end;
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

  select dm.semana_id,
    case
      when p_tipo_menu = 'general'
        then coalesce(c.precio_general_especial, s.precio_general)
      else coalesce(c.precio_opcional_especial, s.precio_opcional)
    end
  into v_semana_id, v_monto
  from public.dias_menu dm
  join public.semanas s on s.id = dm.semana_id and s.activa = true
  join public.clientes c on c.id = v_cliente_id
  where dm.id = p_dia_menu_id;

  if v_semana_id is null then
    raise exception 'El dia no pertenece a la semana activa';
  end if;

  insert into public.pedidos (cliente_id, dia_menu_id, tipo_menu, monto_aplicado)
  values (v_cliente_id, p_dia_menu_id, p_tipo_menu, v_monto)
  on conflict (cliente_id, dia_menu_id)
  do update set
    tipo_menu = excluded.tipo_menu,
    monto_aplicado = excluded.monto_aplicado,
    actualizado_en = now()
  returning id into v_pedido_id;

  return v_pedido_id;
end;
$$;

revoke execute on function public.set_actualizado_en() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_set_order(uuid, uuid, text) from public, anon;
revoke execute on function public.cancel_order(text, uuid) from public, authenticated;
revoke execute on function public.submit_order(text, uuid, text) from public, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_set_order(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_order(text, uuid) to anon;
grant execute on function public.submit_order(text, uuid, text) to anon;

alter table public.pedidos replica identity full;

comment on column public.pedidos.monto_aplicado is
  'Importe fijado al confirmar el pedido; conserva el valor historico.';
