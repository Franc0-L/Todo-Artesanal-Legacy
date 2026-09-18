-- Todo-Artesanal
-- 20260917000001_schema.sql

create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  telefono text,
  cuidados_alimentarios text,
  token text not null unique
    default encode(extensions.gen_random_bytes(16), 'hex'),
  precio_general_especial numeric(10,2),
  precio_opcional_especial numeric(10,2),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint clientes_precio_general_especial_nonnegative
    check (
      precio_general_especial is null
      or precio_general_especial >= 0
    ),

  constraint clientes_precio_opcional_especial_nonnegative
    check (
      precio_opcional_especial is null
      or precio_opcional_especial >= 0
    )
);

create table if not exists public.semanas (
  id uuid primary key default gen_random_uuid(),
  fecha_inicio date not null,
  activa boolean not null default false,
  precio_general numeric(10,2) not null default 0,
  precio_opcional numeric(10,2) not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint semanas_precio_general_nonnegative
    check (precio_general >= 0),

  constraint semanas_precio_opcional_nonnegative
    check (precio_opcional >= 0)
);

create unique index if not exists semanas_una_activa_idx
  on public.semanas (activa)
  where activa = true;

create table if not exists public.platos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  clima text not null default 'cualquiera',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint platos_clima_check
    check (
      clima in (
        'cualquiera',
        'frio',
        'templado',
        'calor'
      )
    )
);

create unique index if not exists platos_nombre_normalizado_idx
  on public.platos (lower(trim(nombre)));

create table if not exists public.dias_menu (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.semanas(id) on delete cascade,
  dia_semana text not null,
  fecha date not null,
  plato_general_id uuid not null references public.platos(id),
  plato_opcional_id uuid not null references public.platos(id),

  constraint dias_menu_dia_check
    check (
      dia_semana in (
        'lunes',
        'martes',
        'miercoles',
        'jueves',
        'viernes'
      )
    ),

  constraint dias_menu_platos_distintos
    check (plato_general_id <> plato_opcional_id)
);

create unique index if not exists dias_menu_semana_dia_idx
  on public.dias_menu (semana_id, dia_semana);

create unique index if not exists dias_menu_semana_fecha_idx
  on public.dias_menu (semana_id, fecha);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  dia_menu_id uuid not null references public.dias_menu(id),
  tipo_menu text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint pedidos_tipo_menu_check
    check (
      tipo_menu in (
        'general',
        'opcional',
        'no_come'
      )
    ),

  constraint pedidos_cliente_dia_unique
    unique (cliente_id, dia_menu_id)
);

create index if not exists dias_menu_semana_id_idx
  on public.dias_menu (semana_id);

create index if not exists dias_menu_plato_general_id_idx
  on public.dias_menu (plato_general_id);

create index if not exists dias_menu_plato_opcional_id_idx
  on public.dias_menu (plato_opcional_id);

create index if not exists pedidos_cliente_id_idx
  on public.pedidos (cliente_id);

create index if not exists pedidos_dia_menu_id_idx
  on public.pedidos (dia_menu_id);

create index if not exists pedidos_creado_en_idx
  on public.pedidos (creado_en);

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
  p.actualizado_en

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

create or replace view public.vista_uso_platos
with (security_invoker = true)
as
select
  p.id,
  p.nombre,
  p.categoria,
  p.clima,
  p.activo,
  p.creado_en,
  p.actualizado_en,

  count(distinct dm_general.id)
    + count(distinct dm_opcional.id) as veces_usado,

  greatest(
    max(dm_general.fecha),
    max(dm_opcional.fecha)
  ) as ultima_vez_usado

from public.platos p

left join public.dias_menu dm_general
  on dm_general.plato_general_id = p.id

left join public.dias_menu dm_opcional
  on dm_opcional.plato_opcional_id = p.id

group by
  p.id,
  p.nombre,
  p.categoria,
  p.clima,
  p.activo,
  p.creado_en,
  p.actualizado_en;