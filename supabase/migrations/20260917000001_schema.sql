-- Todo-Artesanal-Legacy-Legacy
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
  direccion text,
  cuidados_alimentarios text,
  observaciones text,
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

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'semanal',
  clima text not null default 'cualquiera',
  precio_base numeric(10,2),
  plato_unico_id uuid references public.platos(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint menus_tipo_check
    check (tipo in ('semanal', 'especial')),

  constraint menus_clima_check
    check (
      clima in (
        'cualquiera',
        'frio',
        'templado',
        'calor'
      )
    ),

  constraint menus_precio_base_solo_especial
    check (tipo = 'especial' or precio_base is null),

  constraint menus_precio_base_nonnegative
    check (precio_base is null or precio_base >= 0)
);

create unique index if not exists menus_plato_unico_id_idx
  on public.menus (plato_unico_id)
  where plato_unico_id is not null;

create table if not exists public.menu_componentes (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  plato_id uuid not null references public.platos(id),
  rol text not null,

  constraint menu_componentes_rol_check
    check (rol in ('principal', 'guarnicion')),

  constraint menu_componentes_menu_rol_unique
    unique (menu_id, rol)
);

create index if not exists menu_componentes_menu_id_idx
  on public.menu_componentes (menu_id);

create index if not exists menu_componentes_plato_id_idx
  on public.menu_componentes (plato_id);

create table if not exists public.dias_menu (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.semanas(id) on delete cascade,
  dia_semana text not null,
  fecha date not null,
  menu_general_id uuid not null references public.menus(id),
  menu_opcional_id uuid not null references public.menus(id),

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

  constraint dias_menu_menus_distintos
    check (menu_general_id <> menu_opcional_id)
);

create unique index if not exists dias_menu_semana_dia_idx
  on public.dias_menu (semana_id, dia_semana);

create unique index if not exists dias_menu_semana_fecha_idx
  on public.dias_menu (semana_id, fecha);

create index if not exists dias_menu_semana_id_idx
  on public.dias_menu (semana_id);

create index if not exists dias_menu_menu_general_id_idx
  on public.dias_menu (menu_general_id);

create index if not exists dias_menu_menu_opcional_id_idx
  on public.dias_menu (menu_opcional_id);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  dia_menu_id uuid not null references public.dias_menu(id),
  estado text not null,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint pedidos_estado_check
    check (estado in ('no_come', 'respondido')),

  constraint pedidos_cliente_dia_unique
    unique (cliente_id, dia_menu_id)
);

create index if not exists pedidos_cliente_id_idx
  on public.pedidos (cliente_id);

create index if not exists pedidos_dia_menu_id_idx
  on public.pedidos (dia_menu_id);

create index if not exists pedidos_creado_en_idx
  on public.pedidos (creado_en);

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  menu_id uuid not null references public.menus(id),
  cantidad integer not null default 1,
  precio_unitario_aplicado numeric(10,2) not null,
  monto_aplicado numeric(10,2) not null,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint pedido_items_cantidad_positiva
    check (cantidad > 0),

  constraint pedido_items_precio_unitario_nonnegative
    check (precio_unitario_aplicado >= 0),

  constraint pedido_items_monto_nonnegative
    check (monto_aplicado >= 0)
);

create index if not exists pedido_items_pedido_id_idx
  on public.pedido_items (pedido_id);

create index if not exists pedido_items_menu_id_idx
  on public.pedido_items (menu_id);

create table if not exists public.precios_especiales_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  precio numeric(10,2) not null,

  constraint precios_especiales_cliente_precio_nonnegative
    check (precio >= 0),

  constraint precios_especiales_cliente_unique
    unique (cliente_id, menu_id)
);

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
  coalesce(pi.monto_aplicado, 0)::numeric as monto

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

left join public.menu_componentes mc
  on mc.plato_id = p.id

left join public.dias_menu dm_general
  on dm_general.menu_general_id = mc.menu_id

left join public.dias_menu dm_opcional
  on dm_opcional.menu_opcional_id = mc.menu_id

group by
  p.id,
  p.nombre,
  p.categoria,
  p.clima,
  p.activo,
  p.creado_en,
  p.actualizado_en;
