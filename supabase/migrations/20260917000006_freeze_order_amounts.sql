-- Todo-Artesanal
-- 20260917000006_freeze_order_amounts.sql

update public.pedidos p
set monto_aplicado = case
  when p.tipo_menu = 'general'
    then coalesce(c.precio_general_especial, s.precio_general)
  when p.tipo_menu = 'opcional'
    then coalesce(c.precio_opcional_especial, s.precio_opcional)
  else 0
end
from public.clientes c,
     public.dias_menu dm,
     public.semanas s
where c.id = p.cliente_id
  and dm.id = p.dia_menu_id
  and s.id = dm.semana_id
  and p.monto_aplicado is null;

alter table public.pedidos
  alter column monto_aplicado set not null;

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
  p.monto_aplicado::numeric as monto

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
