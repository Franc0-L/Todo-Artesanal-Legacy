-- =========================================================
-- Todo Artesanal v2 — Fase 6
-- 20261001000003_week_day_cutoff.sql
--
-- Responsabilidad: regla de dominio "fuera de horario" con corte
-- POR DÍA.
--   - week_days.cutoff_at (timestamptz NOT NULL): instante en el que
--     dejan de aceptarse respuestas (pedidos y cancelaciones) de
--     CLIENTES para ese día. El admin nunca se ve bloqueado.
--   - Default: 20:00 del día anterior en
--     America/Argentina/Buenos_Aires (la cocina cierra la noche
--     anterior a cada día de servicio).
--   - Se completa con un trigger BEFORE INSERT sobre week_days
--     (create_week / update_week insertan los días sin cutoff) y se
--     backfillea sobre los días existentes.
--   - private.enforce_client_day_cutoff(): trigger BEFORE INSERT OR
--     UPDATE OR DELETE sobre orders y cancellations que rechaza al
--     cliente cuando now() > cutoff_at del día. La identidad de
--     cliente sale de private.current_client_id(); sin ese claim
--     (admin, service_role, scripts) no se aplica.
--
-- Decisión de dominio:
--   docs/decisiones/20261001-fuera-de-horario-cutoff-por-dia.md
--
-- Frontera: la UI de cliente solo oculta/deshabilita botones (UX);
-- quien cumple la regla es este trigger (P0001 → BUSINESS_RULE en el
-- frontend). El admin sigue pudiendo operar sobre cualquier día de
-- una semana no cerrada.
--
-- La zona horaria del default es fija (no depende de TimeZone de la
-- sesión ni del navegador): el corte se almacena como timestamptz y
-- todas las comparaciones son contra now().
-- =========================================================

-- ---------------------------------------------------------
-- 1. week_days.cutoff_at
-- ---------------------------------------------------------
-- Se agrega nullable para backfillear y recién después reforzar
-- NOT NULL en la misma migración.

alter table public.week_days
  add column cutoff_at timestamptz;

-- Backfill: 20:00 del día anterior al día de servicio, en hora
-- Argentina. date + time = timestamp (hora local naïve);
-- "at time zone" la interpreta en Argentina y devuelve timestamptz.
update public.week_days
set cutoff_at = (((date - 1) + time '20:00')
                   at time zone 'America/Argentina/Buenos_Aires')
where cutoff_at is null;

alter table public.week_days
  alter column cutoff_at set not null;

comment on column public.week_days.cutoff_at is
  'Instante en que cierran las respuestas de clientes para este día. '
  'Default: 20:00 del día anterior (America/Argentina/Buenos_Aires).';


-- ---------------------------------------------------------
-- 2. Default en inserciones (create_week / update_week)
-- ---------------------------------------------------------
-- week_days solo se crea por los RPC create_week y update_week, que
-- no conocen cutoff_at. Este trigger completa el mismo default del
-- backfill; una carga explícita (updateWeekDayCutoff) lo pisa.

create or replace function private.default_week_day_cutoff()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.cutoff_at is null then
    new.cutoff_at := (((new.date - 1) + time '20:00')
                        at time zone 'America/Argentina/Buenos_Aires');
  end if;
  return new;
end;
$$;

create trigger week_days_default_cutoff
before insert
on public.week_days
for each row
execute function private.default_week_day_cutoff();


-- ---------------------------------------------------------
-- 3. Corte de respuestas de clientes (orders / cancellations)
-- ---------------------------------------------------------
-- Aplica a INSERT, UPDATE y DELETE: después del cierre el cliente
-- no puede crear, modificar ni quitar ni un pedido ni una
-- cancelación del día. Quien sí puede es el admin (claim client_id
-- ausente), que es el responsable de corregir a mano.
--
-- El día sale de week_day_id (NOT NULL en ambas tablas desde
-- 20260929000001), nunca de week_day_option_id: la media vianda de
-- catálogo no tiene opción.

create or replace function private.enforce_client_day_cutoff()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_day_id uuid;
  v_cutoff_at timestamptz;
begin
  -- Sin identidad de cliente no hay cierre de horario: admin,
  -- service_role y scripts quedan exentos.
  if private.current_client_id() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_week_day_id := case
    when tg_op = 'DELETE' then old.week_day_id
    else new.week_day_id
  end if;

  select wd.cutoff_at
  into v_cutoff_at
  from public.week_days wd
  where wd.id = v_week_day_id;

  -- Si el día no existe, otra validación lo rechaza con un mensaje
  -- más preciso (validate_order / FK); acá no nos entrometemos.
  if found and now() > v_cutoff_at then
    raise exception 'Fuera de horario: las respuestas para este día cerraron el %',
      to_char(v_cutoff_at at time zone 'America/Argentina/Buenos_Aires',
              'DD/MM/YYYY HH24:MI');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger orders_client_cutoff
before insert or update or delete
on public.orders
for each row
execute function private.enforce_client_day_cutoff();

create trigger cancellations_client_cutoff
before insert or update or delete
on public.cancellations
for each row
execute function private.enforce_client_day_cutoff();

-- ---------------------------------------------------------
-- FIN 20261001000003_week_day_cutoff.sql
-- ---------------------------------------------------------
