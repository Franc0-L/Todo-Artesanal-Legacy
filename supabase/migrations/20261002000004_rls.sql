-- Todo Artesanal - 0004 - Policies de RLS (frontera de seguridad).


CREATE POLICY cancellations_admin_all ON public.cancellations TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY cancellations_client_insert_own ON public.cancellations FOR INSERT TO authenticated WITH CHECK ((client_id = private.current_client_id()));



CREATE POLICY cancellations_client_select_own ON public.cancellations FOR SELECT TO authenticated USING ((client_id = private.current_client_id()));



CREATE POLICY cancellations_client_update_own ON public.cancellations FOR UPDATE TO authenticated USING ((client_id = private.current_client_id())) WITH CHECK ((client_id = private.current_client_id()));



CREATE POLICY client_prices_admin_all ON public.client_prices TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY client_prices_client_select_own ON public.client_prices FOR SELECT TO authenticated USING ((client_id = private.current_client_id()));



CREATE POLICY client_product_prices_admin_all ON public.client_product_prices TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY client_product_prices_client_select_own ON public.client_product_prices FOR SELECT TO authenticated USING ((client_id = private.current_client_id()));



CREATE POLICY client_tokens_admin_all ON public.client_tokens TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY clients_admin_all ON public.clients TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY clients_client_select ON public.clients FOR SELECT TO authenticated USING ((id = private.current_client_id()));



CREATE POLICY dish_versions_admin_all ON public.dish_versions TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY dish_versions_client_select_active ON public.dish_versions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM ((public.week_day_options wdo
     JOIN public.week_days wd ON ((wd.id = wdo.week_day_id)))
     JOIN public.weeks w ON ((w.id = wd.week_id)))
  WHERE ((w.status = 'active'::text) AND (wdo.option_type = 'dish'::text) AND (wdo.dish_version_id = dish_versions.id)))) OR (EXISTS ( SELECT 1
   FROM (((public.week_day_options wdo
     JOIN public.week_days wd ON ((wd.id = wdo.week_day_id)))
     JOIN public.weeks w ON ((w.id = wd.week_id)))
     JOIN public.menu_version_items mvi ON ((mvi.menu_version_id = wdo.menu_version_id)))
  WHERE ((w.status = 'active'::text) AND (wdo.option_type = 'menu'::text) AND (mvi.dish_version_id = dish_versions.id))))));



CREATE POLICY dishes_admin_all ON public.dishes TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY menu_version_items_admin_all ON public.menu_version_items TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY menu_version_items_client_select_active ON public.menu_version_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.week_day_options wdo
     JOIN public.week_days wd ON ((wd.id = wdo.week_day_id)))
     JOIN public.weeks w ON ((w.id = wd.week_id)))
  WHERE ((w.status = 'active'::text) AND (wdo.option_type = 'menu'::text) AND (wdo.menu_version_id = menu_version_items.menu_version_id)))));



CREATE POLICY menu_versions_admin_all ON public.menu_versions TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY menu_versions_client_select_active ON public.menu_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.week_day_options wdo
     JOIN public.week_days wd ON ((wd.id = wdo.week_day_id)))
     JOIN public.weeks w ON ((w.id = wd.week_id)))
  WHERE ((w.status = 'active'::text) AND (wdo.option_type = 'menu'::text) AND (wdo.menu_version_id = menu_versions.id)))));



CREATE POLICY menus_admin_all ON public.menus TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY orders_admin_all ON public.orders TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY orders_client_insert_own ON public.orders FOR INSERT TO authenticated WITH CHECK ((client_id = private.current_client_id()));



CREATE POLICY orders_client_select_own ON public.orders FOR SELECT TO authenticated USING ((client_id = private.current_client_id()));



CREATE POLICY orders_client_update_own ON public.orders FOR UPDATE TO authenticated USING ((client_id = private.current_client_id())) WITH CHECK ((client_id = private.current_client_id()));



CREATE POLICY week_day_options_admin_all ON public.week_day_options TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY week_day_options_client_select_active ON public.week_day_options FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.week_days wd
     JOIN public.weeks w ON ((w.id = wd.week_id)))
  WHERE ((wd.id = week_day_options.week_day_id) AND (w.status = 'active'::text)))));



CREATE POLICY week_days_admin_all ON public.week_days TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY week_days_client_select_active ON public.week_days FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.weeks w
  WHERE ((w.id = week_days.week_id) AND (w.status = 'active'::text)))));



CREATE POLICY week_expected_clients_admin_all ON public.week_expected_clients TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY weeks_admin_all ON public.weeks TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());



CREATE POLICY weeks_client_select_active ON public.weeks FOR SELECT TO authenticated USING ((status = 'active'::text));


