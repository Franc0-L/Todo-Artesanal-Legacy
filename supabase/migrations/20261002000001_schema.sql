-- Todo Artesanal - 0001 - Esquema: schemas, tablas, constraints, indices y RLS habilitado.


CREATE SCHEMA private;




CREATE TABLE private.admin_users (
    user_id uuid NOT NULL
);




CREATE TABLE public.cancellations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    week_day_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);




CREATE TABLE public.client_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    modality text NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_prices_modality_check CHECK ((modality = ANY (ARRAY['general'::text, 'opcional'::text]))),
    CONSTRAINT client_prices_price_nonnegative CHECK ((price >= (0)::numeric))
);




CREATE TABLE public.client_product_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    dish_id uuid NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_product_prices_price_nonnegative CHECK ((price >= (0)::numeric))
);




CREATE TABLE public.client_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone,
    CONSTRAINT client_tokens_invalidated_after_created CHECK (((invalidated_at IS NULL) OR (invalidated_at >= created_at)))
);




CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    special_care text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    allows_half_portion boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);




CREATE TABLE public.dish_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dish_id uuid NOT NULL,
    version_number integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dish_versions_price_nonnegative CHECK ((price >= (0)::numeric)),
    CONSTRAINT dish_versions_version_positive CHECK ((version_number > 0))
);




CREATE TABLE public.dishes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text,
    climate text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dishes_climate_check CHECK (((climate IS NULL) OR (climate = ANY (ARRAY['frio'::text, 'templado'::text, 'calor'::text]))))
);




CREATE TABLE public.menu_version_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_version_id uuid NOT NULL,
    dish_version_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_version_items_role_check CHECK ((role = ANY (ARRAY['main'::text, 'side'::text])))
);




CREATE TABLE public.menu_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    version_number integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_versions_price_nonnegative CHECK ((price >= (0)::numeric)),
    CONSTRAINT menu_versions_version_positive CHECK ((version_number > 0))
);




CREATE TABLE public.menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);




CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    week_day_option_id uuid,
    modality text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    applied_price numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    week_day_id uuid NOT NULL,
    dish_version_id uuid,
    menu_version_id uuid,
    CONSTRAINT orders_applied_price_nonnegative CHECK ((applied_price >= (0)::numeric)),
    CONSTRAINT orders_modality_check CHECK ((modality = ANY (ARRAY['general'::text, 'opcional'::text, 'media_vianda'::text]))),
    CONSTRAINT orders_product_source_check CHECK (
CASE modality
    WHEN 'media_vianda'::text THEN (((((week_day_option_id IS NOT NULL))::integer + ((dish_version_id IS NOT NULL))::integer) + ((menu_version_id IS NOT NULL))::integer) = 1)
    ELSE ((week_day_option_id IS NOT NULL) AND (dish_version_id IS NULL) AND (menu_version_id IS NULL))
END),
    CONSTRAINT orders_quantity_positive CHECK ((quantity > 0))
);




CREATE TABLE public.week_day_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_day_id uuid NOT NULL,
    option_type text NOT NULL,
    dish_version_id uuid,
    menu_version_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    offer_modality text NOT NULL,
    CONSTRAINT week_day_options_offer_modality_check CHECK ((offer_modality = ANY (ARRAY['general'::text, 'opcional'::text]))),
    CONSTRAINT week_day_options_source_xor CHECK ((((option_type = 'dish'::text) AND (dish_version_id IS NOT NULL) AND (menu_version_id IS NULL)) OR ((option_type = 'menu'::text) AND (menu_version_id IS NOT NULL) AND (dish_version_id IS NULL)))),
    CONSTRAINT week_day_options_type_check CHECK ((option_type = ANY (ARRAY['dish'::text, 'menu'::text])))
);




CREATE TABLE public.week_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cutoff_at timestamp with time zone NOT NULL,
    CONSTRAINT week_days_day_matches_date CHECK ((EXTRACT(isodow FROM date) = (day_of_week)::numeric)),
    CONSTRAINT week_days_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 5)))
);




COMMENT ON COLUMN public.week_days.cutoff_at IS 'Instante en que cierran las respuestas de clientes para este día. Default: 20:00 del día anterior (America/Argentina/Buenos_Aires).';



CREATE TABLE public.week_expected_clients (
    week_id uuid NOT NULL,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);




CREATE TABLE public.weeks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weeks_dates_valid CHECK ((end_date >= start_date)),
    CONSTRAINT weeks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])))
);




ALTER TABLE ONLY private.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (user_id);



ALTER TABLE ONLY public.cancellations
    ADD CONSTRAINT cancellations_client_day_unique UNIQUE (client_id, week_day_id);



ALTER TABLE ONLY public.cancellations
    ADD CONSTRAINT cancellations_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.client_prices
    ADD CONSTRAINT client_prices_client_modality_unique UNIQUE (client_id, modality);



ALTER TABLE ONLY public.client_prices
    ADD CONSTRAINT client_prices_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.client_product_prices
    ADD CONSTRAINT client_product_prices_client_dish_unique UNIQUE (client_id, dish_id);



ALTER TABLE ONLY public.client_product_prices
    ADD CONSTRAINT client_product_prices_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.client_tokens
    ADD CONSTRAINT client_tokens_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.client_tokens
    ADD CONSTRAINT client_tokens_token_hash_unique UNIQUE (token_hash);



ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.dish_versions
    ADD CONSTRAINT dish_versions_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.dish_versions
    ADD CONSTRAINT dish_versions_unique_version UNIQUE (dish_id, version_number);



ALTER TABLE ONLY public.dishes
    ADD CONSTRAINT dishes_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.menu_version_items
    ADD CONSTRAINT menu_version_items_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.menu_version_items
    ADD CONSTRAINT menu_version_items_unique_dish UNIQUE (menu_version_id, dish_version_id);



ALTER TABLE ONLY public.menu_versions
    ADD CONSTRAINT menu_versions_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.menu_versions
    ADD CONSTRAINT menu_versions_unique_version UNIQUE (menu_id, version_number);



ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_option_modality_unique UNIQUE (client_id, week_day_option_id, modality);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.week_day_options
    ADD CONSTRAINT week_day_options_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.week_days
    ADD CONSTRAINT week_days_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.week_days
    ADD CONSTRAINT week_days_week_date_unique UNIQUE (week_id, date);



ALTER TABLE ONLY public.week_days
    ADD CONSTRAINT week_days_week_day_of_week_unique UNIQUE (week_id, day_of_week);



ALTER TABLE ONLY public.week_expected_clients
    ADD CONSTRAINT week_expected_clients_pkey PRIMARY KEY (week_id, client_id);



ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT weeks_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[]'::text) WITH &&);



ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT weeks_pkey PRIMARY KEY (id);



CREATE INDEX cancellations_client_id_idx ON public.cancellations USING btree (client_id);



CREATE INDEX cancellations_week_day_id_idx ON public.cancellations USING btree (week_day_id);



CREATE INDEX client_tokens_client_id_idx ON public.client_tokens USING btree (client_id);



CREATE UNIQUE INDEX client_tokens_one_valid_per_client_idx ON public.client_tokens USING btree (client_id) WHERE (invalidated_at IS NULL);



CREATE INDEX dish_versions_dish_id_idx ON public.dish_versions USING btree (dish_id);



CREATE INDEX menu_version_items_menu_version_id_idx ON public.menu_version_items USING btree (menu_version_id);



CREATE UNIQUE INDEX menu_version_items_one_main_idx ON public.menu_version_items USING btree (menu_version_id) WHERE (role = 'main'::text);



CREATE INDEX menu_versions_menu_id_idx ON public.menu_versions USING btree (menu_id);



CREATE UNIQUE INDEX orders_catalog_dish_unique ON public.orders USING btree (client_id, week_day_id, dish_version_id) WHERE (dish_version_id IS NOT NULL);



CREATE UNIQUE INDEX orders_catalog_menu_unique ON public.orders USING btree (client_id, week_day_id, menu_version_id) WHERE (menu_version_id IS NOT NULL);



CREATE INDEX orders_client_id_idx ON public.orders USING btree (client_id);



CREATE INDEX orders_dish_version_id_idx ON public.orders USING btree (dish_version_id) WHERE (dish_version_id IS NOT NULL);



CREATE INDEX orders_menu_version_id_idx ON public.orders USING btree (menu_version_id) WHERE (menu_version_id IS NOT NULL);



CREATE INDEX orders_week_day_id_idx ON public.orders USING btree (week_day_id);



CREATE INDEX orders_week_day_option_id_idx ON public.orders USING btree (week_day_option_id);



CREATE INDEX week_day_options_dish_version_id_idx ON public.week_day_options USING btree (dish_version_id);



CREATE INDEX week_day_options_menu_version_id_idx ON public.week_day_options USING btree (menu_version_id);



CREATE INDEX week_day_options_week_day_id_idx ON public.week_day_options USING btree (week_day_id);



CREATE UNIQUE INDEX week_day_options_week_day_offer_modality_unique ON public.week_day_options USING btree (week_day_id, offer_modality);



CREATE INDEX week_expected_clients_client_id_idx ON public.week_expected_clients USING btree (client_id);



CREATE UNIQUE INDEX weeks_one_active_idx ON public.weeks USING btree (status) WHERE (status = 'active'::text);



ALTER TABLE ONLY private.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.cancellations
    ADD CONSTRAINT cancellations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);



ALTER TABLE ONLY public.cancellations
    ADD CONSTRAINT cancellations_week_day_id_fkey FOREIGN KEY (week_day_id) REFERENCES public.week_days(id);



ALTER TABLE ONLY public.client_prices
    ADD CONSTRAINT client_prices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.client_product_prices
    ADD CONSTRAINT client_product_prices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.client_product_prices
    ADD CONSTRAINT client_product_prices_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.client_tokens
    ADD CONSTRAINT client_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.dish_versions
    ADD CONSTRAINT dish_versions_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id);



ALTER TABLE ONLY public.menu_version_items
    ADD CONSTRAINT menu_version_items_dish_version_id_fkey FOREIGN KEY (dish_version_id) REFERENCES public.dish_versions(id);



ALTER TABLE ONLY public.menu_version_items
    ADD CONSTRAINT menu_version_items_menu_version_id_fkey FOREIGN KEY (menu_version_id) REFERENCES public.menu_versions(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.menu_versions
    ADD CONSTRAINT menu_versions_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_dish_version_id_fkey FOREIGN KEY (dish_version_id) REFERENCES public.dish_versions(id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_menu_version_id_fkey FOREIGN KEY (menu_version_id) REFERENCES public.menu_versions(id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_week_day_id_fkey FOREIGN KEY (week_day_id) REFERENCES public.week_days(id);



ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_week_day_option_id_fkey FOREIGN KEY (week_day_option_id) REFERENCES public.week_day_options(id);



ALTER TABLE ONLY public.week_day_options
    ADD CONSTRAINT week_day_options_dish_version_id_fkey FOREIGN KEY (dish_version_id) REFERENCES public.dish_versions(id);



ALTER TABLE ONLY public.week_day_options
    ADD CONSTRAINT week_day_options_menu_version_id_fkey FOREIGN KEY (menu_version_id) REFERENCES public.menu_versions(id);



ALTER TABLE ONLY public.week_day_options
    ADD CONSTRAINT week_day_options_week_day_id_fkey FOREIGN KEY (week_day_id) REFERENCES public.week_days(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.week_days
    ADD CONSTRAINT week_days_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.weeks(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.week_expected_clients
    ADD CONSTRAINT week_expected_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);



ALTER TABLE ONLY public.week_expected_clients
    ADD CONSTRAINT week_expected_clients_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.weeks(id) ON DELETE CASCADE;



ALTER TABLE private.admin_users ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.client_prices ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.client_product_prices ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.client_tokens ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.dish_versions ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.menu_version_items ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.menu_versions ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.week_day_options ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.week_days ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.week_expected_clients ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

