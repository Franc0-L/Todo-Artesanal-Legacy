-- Todo Artesanal - 0003 - Triggers de dominio (y su funcion de soporte).


CREATE FUNCTION public.validate_week_day_option_product_uniqueness() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_week_id uuid;
  v_product_id uuid;
begin
  select wd.week_id
    into v_week_id
  from public.week_days wd
  where wd.id = new.week_day_id;

  if v_week_id is null then
    raise exception 'El día de la semana % no existe', new.week_day_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_week_id::text, 0));

  if new.option_type = 'dish' then
    select dv.dish_id into v_product_id
    from public.dish_versions dv
    where dv.id = new.dish_version_id;

    if v_product_id is null then
      raise exception 'La versión de plato % no existe', new.dish_version_id;
    end if;

    if exists (
      select 1
      from public.week_day_options other
      join public.week_days other_day on other_day.id = other.week_day_id
      join public.dish_versions other_version on other_version.id = other.dish_version_id
      where other_day.week_id = v_week_id
        and other.option_type = 'dish'
        and other_version.dish_id = v_product_id
        and other.id <> new.id
    ) then
      raise exception 'El plato % ya está utilizado en otro día de esta semana', v_product_id;
    end if;
  elsif new.option_type = 'menu' then
    select mv.menu_id into v_product_id
    from public.menu_versions mv
    where mv.id = new.menu_version_id;

    if v_product_id is null then
      raise exception 'La versión de menú % no existe', new.menu_version_id;
    end if;

    if exists (
      select 1
      from public.week_day_options other
      join public.week_days other_day on other_day.id = other.week_day_id
      join public.menu_versions other_version on other_version.id = other.menu_version_id
      where other_day.week_id = v_week_id
        and other.option_type = 'menu'
        and other_version.menu_id = v_product_id
        and other.id <> new.id
    ) then
      raise exception 'El menú % ya está utilizado en otro día de esta semana', v_product_id;
    end if;
  end if;

  return new;
end;
$$;



SET default_tablespace = '';

SET default_table_access_method = heap;


CREATE TRIGGER cancellations_client_cutoff BEFORE INSERT OR DELETE OR UPDATE ON public.cancellations FOR EACH ROW EXECUTE FUNCTION private.enforce_client_day_cutoff();



CREATE TRIGGER cancellations_closed_protection BEFORE INSERT OR DELETE OR UPDATE ON public.cancellations FOR EACH ROW EXECUTE FUNCTION private.prevent_closed_cancellation_mutation();



CREATE TRIGGER cancellations_no_order BEFORE INSERT OR UPDATE ON public.cancellations FOR EACH ROW EXECUTE FUNCTION private.prevent_cancellation_with_order();



CREATE TRIGGER dish_versions_immutable_delete BEFORE DELETE ON public.dish_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_dish_version_mutation();



CREATE TRIGGER dish_versions_immutable_update BEFORE UPDATE ON public.dish_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_dish_version_mutation();



CREATE CONSTRAINT TRIGGER menu_version_items_require_main AFTER INSERT OR DELETE OR UPDATE ON public.menu_version_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_menu_version_main();



CREATE TRIGGER menu_versions_immutable_delete BEFORE DELETE ON public.menu_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_menu_version_mutation();



CREATE TRIGGER menu_versions_immutable_update BEFORE UPDATE ON public.menu_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_menu_version_mutation();



CREATE TRIGGER orders_client_cutoff BEFORE INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.enforce_client_day_cutoff();



CREATE TRIGGER orders_closed_protection BEFORE INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.prevent_closed_order_mutation();



CREATE TRIGGER orders_no_cancellation BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.prevent_order_with_cancellation();



CREATE TRIGGER orders_validate_insert_update BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.validate_order();



CREATE TRIGGER trg_validate_week_day_option_product_uniqueness BEFORE INSERT OR UPDATE OF week_day_id, option_type, dish_version_id, menu_version_id ON public.week_day_options FOR EACH ROW EXECUTE FUNCTION public.validate_week_day_option_product_uniqueness();



CREATE TRIGGER week_day_options_closed_protection BEFORE INSERT OR DELETE OR UPDATE ON public.week_day_options FOR EACH ROW EXECUTE FUNCTION private.prevent_closed_week_day_option_mutation();



CREATE TRIGGER week_day_options_order_freeze BEFORE DELETE OR UPDATE ON public.week_day_options FOR EACH ROW EXECUTE FUNCTION private.prevent_ordered_option_mutation();



CREATE TRIGGER week_days_closed_protection BEFORE INSERT OR DELETE OR UPDATE ON public.week_days FOR EACH ROW EXECUTE FUNCTION private.prevent_closed_week_day_mutation();



CREATE TRIGGER week_days_default_cutoff BEFORE INSERT ON public.week_days FOR EACH ROW EXECUTE FUNCTION private.default_week_day_cutoff();



CREATE TRIGGER weeks_status_protected BEFORE UPDATE OF status ON public.weeks FOR EACH ROW EXECUTE FUNCTION private.prevent_direct_week_status_change();


