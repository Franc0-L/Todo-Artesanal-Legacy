-- Rollback de 20260926000002_add_week_offer_modality.sql
-- Reversa la columna/índice y restaura las dos funciones reemplazadas por la migración.

DROP INDEX IF EXISTS public.week_day_options_week_day_offer_modality_unique;
ALTER TABLE public.week_day_options
  DROP CONSTRAINT IF EXISTS week_day_options_offer_modality_check;
ALTER TABLE public.week_day_options
  DROP COLUMN IF EXISTS offer_modality;

CREATE OR REPLACE FUNCTION public.activate_week(p_week_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_status text; v_day_count integer; v_empty_day_count integer; v_invalid_menu_count integer;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Solo administradores pueden activar semanas'; END IF;
  SELECT status INTO v_status FROM public.weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La semana % no existe', p_week_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Solo se puede activar una semana en estado draft. Estado actual: %', v_status; END IF;
  IF EXISTS (SELECT 1 FROM public.weeks WHERE status = 'active' AND id <> p_week_id) THEN RAISE EXCEPTION 'Ya existe otra semana activa'; END IF;
  SELECT count(*) INTO v_day_count FROM public.week_days WHERE week_id = p_week_id;
  IF v_day_count <> 5 THEN RAISE EXCEPTION 'La semana debe tener exactamente 5 días para activarse. Tiene %', v_day_count; END IF;
  SELECT count(*) INTO v_empty_day_count FROM public.week_days wd WHERE wd.week_id = p_week_id AND NOT EXISTS (SELECT 1 FROM public.week_day_options wdo WHERE wdo.week_day_id = wd.id);
  IF v_empty_day_count > 0 THEN RAISE EXCEPTION 'No se puede activar la semana: existen % días sin opciones de oferta', v_empty_day_count; END IF;
  SELECT count(*) INTO v_invalid_menu_count FROM (SELECT DISTINCT wdo.menu_version_id FROM public.week_day_options wdo JOIN public.week_days wd ON wd.id = wdo.week_day_id WHERE wd.week_id = p_week_id AND wdo.option_type = 'menu') used_menus WHERE (SELECT count(*) FROM public.menu_version_items mvi WHERE mvi.menu_version_id = used_menus.menu_version_id AND mvi.role = 'main') <> 1;
  IF v_invalid_menu_count > 0 THEN RAISE EXCEPTION 'No se puede activar la semana: existen % versiones de menú utilizadas sin exactamente un plato principal', v_invalid_menu_count; END IF;
  INSERT INTO public.week_expected_clients (week_id, client_id) SELECT p_week_id, c.id FROM public.clients c WHERE c.active = true;
  PERFORM set_config('todo_artesanal.allow_week_transition', 'true', true);
  UPDATE public.weeks SET status = 'active', updated_at = now() WHERE id = p_week_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_week_id uuid; v_week_status text; v_expected boolean;
BEGIN
  SELECT wd.week_id INTO v_week_id FROM public.week_day_options wdo JOIN public.week_days wd ON wd.id = wdo.week_day_id WHERE wdo.id = new.week_day_option_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La opción de día % no existe', new.week_day_option_id; END IF;
  SELECT status INTO v_week_status FROM public.weeks WHERE id = v_week_id;
  IF v_week_status <> 'active' THEN RAISE EXCEPTION 'Solo se pueden gestionar pedidos de una semana activa'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.week_expected_clients wec WHERE wec.week_id = v_week_id AND wec.client_id = new.client_id) INTO v_expected;
  IF NOT v_expected THEN RAISE EXCEPTION 'El cliente % no pertenece a los clientes esperados de la semana', new.client_id; END IF;
  IF tg_op = 'INSERT' THEN new.applied_price := public.calculate_order_price(new.client_id, new.week_day_option_id, new.modality); RETURN new; END IF;
  IF tg_op = 'UPDATE' THEN
    IF new.client_id IS DISTINCT FROM old.client_id THEN RAISE EXCEPTION 'client_id no puede modificarse en un pedido'; END IF;
    IF new.week_day_option_id IS DISTINCT FROM old.week_day_option_id THEN RAISE EXCEPTION 'week_day_option_id no puede modificarse en un pedido'; END IF;
    IF new.modality IS DISTINCT FROM old.modality THEN RAISE EXCEPTION 'modality no puede modificarse en un pedido'; END IF;
    IF new.applied_price IS DISTINCT FROM old.applied_price THEN RAISE EXCEPTION 'applied_price no puede modificarse en un pedido'; END IF;
    RETURN new;
  END IF;
  RETURN new;
END;
$$;
