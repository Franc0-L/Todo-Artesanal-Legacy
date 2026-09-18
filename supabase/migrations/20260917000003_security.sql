-- Todo-Artesanal
-- 20260917000003_security.sql

alter table public.clientes enable row level security;
alter table public.semanas enable row level security;
alter table public.platos enable row level security;
alter table public.dias_menu enable row level security;
alter table public.pedidos enable row level security;

grant usage on schema private to authenticated;

drop policy if exists clientes_admin_all on public.clientes;
create policy clientes_admin_all
on public.clientes
for all to authenticated
using (private.es_admin())
with check (private.es_admin());

drop policy if exists semanas_admin_all on public.semanas;
create policy semanas_admin_all
on public.semanas
for all to authenticated
using (private.es_admin())
with check (private.es_admin());

drop policy if exists platos_admin_all on public.platos;
create policy platos_admin_all
on public.platos
for all to authenticated
using (private.es_admin())
with check (private.es_admin());

drop policy if exists dias_menu_admin_all on public.dias_menu;
create policy dias_menu_admin_all
on public.dias_menu
for all to authenticated
using (private.es_admin())
with check (private.es_admin());

drop policy if exists pedidos_admin_all on public.pedidos;
create policy pedidos_admin_all
on public.pedidos
for all to authenticated
using (private.es_admin())
with check (private.es_admin());

revoke all on table public.clientes from anon;
revoke all on table public.semanas from anon;
revoke all on table public.platos from anon;
revoke all on table public.dias_menu from anon;
revoke all on table public.pedidos from anon;

grant select, insert, update, delete on table public.clientes to authenticated;
grant select, insert, update, delete on table public.semanas to authenticated;
grant select, insert, update, delete on table public.platos to authenticated;
grant select, insert, update, delete on table public.dias_menu to authenticated;
grant select, insert, update, delete on table public.pedidos to authenticated;

grant select on public.vista_pedidos_semana to authenticated;
grant select on public.vista_uso_platos to authenticated;

grant execute on function private.es_admin() to authenticated;
grant execute on function public.crear_semana(date, numeric, numeric, jsonb) to authenticated;

revoke execute on function public.get_client_menu(text)
from public, authenticated;
grant execute on function public.get_client_menu(text)
to anon;

revoke execute on function public.submit_order(text, uuid, text)
from public, authenticated;
grant execute on function public.submit_order(text, uuid, text)
to anon;

revoke execute on function public.crear_semana(date, numeric, numeric, jsonb)
from public, anon;