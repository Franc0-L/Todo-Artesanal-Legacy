-- Todo-Artesanal
-- RLS tests consolidados (15 pruebas)

begin;

select plan(28);

-- Esta suite usa solo pgTAP y catalogos del sistema, por lo que puede ejecutarse
-- directamente con `supabase test db` sin helpers externos de autenticacion.

insert into public.clientes (nombre, token)
values ('Cliente RLS Test', 'rls-test-token');

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clientes'
      and policyname is null
  ),
  'RLS de clientes configurado'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.clientes'::regclass),
  'RLS activado en clientes'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.semanas'::regclass),
  'RLS activado en semanas'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.platos'::regclass),
  'RLS activado en platos'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.dias_menu'::regclass),
  'RLS activado en dias_menu'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pedidos'::regclass),
  'RLS activado en pedidos'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clientes'
      and policyname = 'clientes_admin_all'
  ),
  'clientes tiene política administrativa'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'semanas'
      and policyname = 'semanas_admin_all'
  ),
  'semanas tiene política administrativa'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'platos'
      and policyname = 'platos_admin_all'
  ),
  'platos tiene política administrativa'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dias_menu'
      and policyname = 'dias_menu_admin_all'
  ),
  'dias_menu tiene política administrativa'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pedidos'
      and policyname = 'pedidos_admin_all'
  ),
  'pedidos tiene política administrativa'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.es_admin()',
    'execute'
  ),
  'authenticated puede ejecutar es_admin'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.crear_semana(date,numeric,numeric,jsonb)',
    'execute'
  ),
  'authenticated puede ejecutar crear_semana'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_client_menu(text)',
    'execute'
  ),
  'anon puede ejecutar get_client_menu'
);

select ok(
  has_function_privilege(
    'anon',
    'public.submit_order(text,uuid,text)',
    'execute'
  ),
  'anon puede ejecutar submit_order'
);

select ok(
  has_function_privilege(
    'anon',
    'public.cancel_order(text,uuid)',
    'execute'
  ),
  'anon puede ejecutar cancel_order'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_set_order(uuid,uuid,text)',
    'execute'
  ),
  'authenticated puede ejecutar admin_set_order'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.rotate_client_token(uuid)',
    'execute'
  ),
  'authenticated puede ejecutar rotate_client_token'
);

select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = 'public.pedidos'::regclass
      and attname = 'monto_aplicado'
      and attnotnull
  ),
  'monto_aplicado es obligatorio'
);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ),
  'pedidos está publicado en Realtime'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'semanas'
      and indexname = 'semanas_una_activa_idx'
  ),
  'solo existe un índice para la semana activa'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'platos'
      and indexname = 'platos_nombre_normalizado_idx'
  ),
  'nombres de platos normalizados son únicos'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'dias_menu_platos_distintos'
  ),
  'los dos platos del día deben ser distintos'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'pedidos_cliente_dia_unique'
  ),
  'un cliente no puede tener dos pedidos para el mismo día'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_actualizado_en'
      and p.proconfig @> array['search_path=""']
  ),
  'set_actualizado_en fija search_path'
);

set local role authenticated;

select is(
  (select count(*) from public.clientes),
  0::bigint,
  'authenticated sin admin no puede ver clientes'
);

reset role;
set local role anon;

select throws_ok(
  'select * from public.clientes',
  '42501',
  'permission denied for table clientes',
  'anon no puede leer clientes directamente'
);

select throws_ok(
  $$select public.submit_order('invalid-token', '00000000-0000-0000-0000-000000000000'::uuid, 'general')$$,
  'P0001',
  'Cliente invalido',
  'un token invalido no puede enviar pedidos'
);

reset role;

select * from finish();
rollback;
