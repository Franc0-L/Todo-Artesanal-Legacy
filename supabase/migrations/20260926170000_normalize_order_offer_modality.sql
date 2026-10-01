-- General/Opcional quedan determinados por la opción de oferta.
-- Media vianda sigue siendo la única modalidad seleccionable en el pedido.

CREATE OR REPLACE FUNCTION private.validate_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_week_id uuid;
  v_week_status text;
  v_expected boolean;
  v_offer_modality text;
BEGIN
  SELECT wd.week_id, wdo.offer_modality
  INTO v_week_id, v_offer_modality
  FROM public.week_day_options wdo
  JOIN public.week_days wd ON wd.id = wdo.week_day_id
  WHERE wdo.id = new.week_day_option_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'La opción de día % no existe', new.week_day_option_id; END IF;
  SELECT status INTO v_week_status FROM public.weeks WHERE id = v_week_id;
  IF v_week_status <> 'active' THEN RAISE EXCEPTION 'Solo se pueden gestionar pedidos de una semana activa'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.week_expected_clients wec WHERE wec.week_id = v_week_id AND wec.client_id = new.client_id) INTO v_expected;
  IF NOT v_expected THEN RAISE EXCEPTION 'El cliente % no pertenece a los clientes esperados de la semana', new.client_id; END IF;

  IF new.modality IN ('general', 'opcional') THEN
    new.modality := v_offer_modality;
  END IF;

  IF tg_op = 'INSERT' THEN
    new.applied_price := public.calculate_order_price(new.client_id, new.week_day_option_id, new.modality);
    RETURN new;
  END IF;

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
