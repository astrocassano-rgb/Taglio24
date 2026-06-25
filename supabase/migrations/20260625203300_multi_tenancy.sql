-- Migrazione 20260625203300_multi_tenancy: Configurazione dello schema Multi-Tenant

-- 1. Creazione della tabella tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'LIGHT', -- LIGHT, PRO, ENTERPRISE
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscription_ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Inserimento del tenant di default per evitare la rottura dei dati esistenti
INSERT INTO public.tenants (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000000', 'DogWash24 Default', 'default', 'ENTERPRISE')
ON CONFLICT (id) DO NOTHING;

-- 3. Aggiunta della colonna tenant_id a tutte le tabelle operative con FK
-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- dogs
ALTER TABLE public.dogs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- stations
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- wallets
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- token_transactions
ALTER TABLE public.token_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- active_sessions
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- admin_audit_logs
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- coupons
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- user_coupons (foreign key di rimando)
ALTER TABLE public.user_coupons ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- pet_treatments
ALTER TABLE public.pet_treatments ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
-- pet_gallery
ALTER TABLE public.pet_gallery ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 4. Modifica della tabella system_settings per legarla ai singoli tenant
ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_id_check;

ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (tenant_id);
ALTER TABLE public.system_settings DROP COLUMN IF EXISTS id;

-- Inseriamo il record di default per system_settings legato al default tenant
INSERT INTO public.system_settings (tenant_id, mode, max_concurrent_assisted, enable_assisted_wash, price_assisted_wash_credits, enable_full_grooming, price_full_grooming_credits)
VALUES ('00000000-0000-0000-0000-000000000000', 'HYBRID', 1, true, 10, true, 50)
ON CONFLICT (tenant_id) DO NOTHING;

-- 5. Creazione della funzione di helper per determinare il tenant corrente
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID,
    (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
END;
$$;

-- 5.1 Cambiamo i default delle colonne per usare la funzione dinamica
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.dogs ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.stations ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.bookings ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.wallets ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.token_transactions ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.active_sessions ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.admin_audit_logs ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.coupons ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.user_coupons ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.pet_treatments ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.pet_gallery ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();

-- 6. Aggiornamento del trigger di creazione dell'utente handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_wallet_id UUID;
  welcome_credits NUMERIC := 2;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := COALESCE(
    (new.raw_user_meta_data ->> 'tenant_id')::UUID,
    '00000000-0000-0000-0000-000000000000'
  );

  INSERT INTO public.profiles (id, email, tenant_id, created_at)
  VALUES (new.id, new.email, v_tenant_id, timezone('utc'::text, now()))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (new.id, v_tenant_id, welcome_credits, timezone('utc'::text, now()))
  ON CONFLICT (customer_id) DO UPDATE
    SET balance_credits = greatest(public.wallets.balance_credits, excluded.balance_credits),
        updated_at = timezone('utc'::text, now())
  RETURNING id INTO new_wallet_id;

  IF new_wallet_id IS NOT NULL THEN
    INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, created_at)
    VALUES (new_wallet_id, v_tenant_id, 'BONUS', welcome_credits, 0, null, timezone('utc'::text, now()));
  END IF;

  RETURN new;
END;
$$;

-- 7. Aggiornamento del vincolo UNIQUE sui Coupon (il codice deve essere unico per salone, non globale)
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_code_key;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_tenant_code_key UNIQUE (tenant_id, code);

-- 8. Aggiornamento della funzione RPC per riscattare i coupon redeem_coupon_code()
CREATE OR REPLACE FUNCTION public.redeem_coupon_code(
  p_code TEXT
)
RETURNS TABLE (
  applied BOOLEAN,
  balance_credits NUMERIC,
  amount_credits NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_coupon_id UUID;
  v_amount NUMERIC;
  v_max_uses INT;
  v_curr_uses INT;
  v_expires TIMESTAMPTZ;
  v_wallet_id UUID;
  v_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  v_tenant_id := public.current_tenant_id();

  -- Trova il coupon specifico per il tenant
  SELECT id, amount_credits, max_uses, current_uses, expires_at
    INTO v_coupon_id, v_amount, v_max_uses, v_curr_uses, v_expires
  FROM public.coupons
  WHERE UPPER(code) = UPPER(TRIM(p_code)) AND tenant_id = v_tenant_id
  FOR UPDATE;

  if not found then
    raise exception 'Codice promozionale non valido per questo salone.' using errcode = 'P0002';
  end if;

  if v_expires is not null and now() > v_expires then
    raise exception 'Codice promozionale scaduto.' using errcode = 'P0001';
  end if;

  if v_max_uses is not null and v_curr_uses >= v_max_uses then
    raise exception 'Codice promozionale non piu disponibile.' using errcode = 'P0001';
  end if;

  -- Controlla se l'utente lo ha gia riscattato
  PERFORM 1
  FROM public.user_coupons
  WHERE customer_id = v_user_id AND coupon_id = v_coupon_id;
  
  if found then
    raise exception 'Codice promozionale gia riscattato.' using errcode = 'P0001';
  end if;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (v_user_id, v_tenant_id, 0, timezone('utc'::text, now()))
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_user_id
  FOR UPDATE;

  UPDATE public.coupons
  SET current_uses = current_uses + 1
  WHERE id = v_coupon_id;

  INSERT INTO public.user_coupons (customer_id, coupon_id, tenant_id)
  VALUES (v_user_id, v_coupon_id, v_tenant_id);

  UPDATE public.wallets
  SET balance_credits = round((public.wallets.balance_credits + v_amount)::numeric, 2)
  WHERE id = v_wallet_id
  RETURNING public.wallets.balance_credits INTO v_balance;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (v_wallet_id, v_tenant_id, 'BONUS', v_amount, 0, null, 'Riscatto coupon: ' || UPPER(TRIM(p_code)));

  applied := true;
  balance_credits := v_balance;
  amount_credits := v_amount;
  RETURN NEXT;
END;
$$;

-- 9. Riconfigurazione delle Row Level Security (RLS) per l'isolamento dei tenant

-- PROFILES
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id());

-- DOGS
DROP POLICY IF EXISTS "dogs_select_own" ON public.dogs;
CREATE POLICY "dogs_select_own" ON public.dogs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "dogs_insert_own" ON public.dogs;
CREATE POLICY "dogs_insert_own" ON public.dogs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "dogs_update_own" ON public.dogs;
CREATE POLICY "dogs_update_own" ON public.dogs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (owner_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "dogs_delete_own" ON public.dogs;
CREATE POLICY "dogs_delete_own" ON public.dogs FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "dogs_admin_all" ON public.dogs;
CREATE POLICY "dogs_admin_all" ON public.dogs FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id());

-- STATIONS (le postazioni possono essere lette in forma anonima per visualizzare la disponibilità sul sito demo)
DROP POLICY IF EXISTS "stations_select_auth" ON public.stations;
CREATE POLICY "stations_select_all" ON public.stations FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "stations_admin_write" ON public.stations;
CREATE POLICY "stations_admin_write" ON public.stations FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- BOOKINGS
DROP POLICY IF EXISTS "bookings_select_own" ON public.bookings;
CREATE POLICY "bookings_select_own" ON public.bookings FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "bookings_insert_own" ON public.bookings;
CREATE POLICY "bookings_insert_own" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "bookings_update_own" ON public.bookings;
CREATE POLICY "bookings_update_own" ON public.bookings FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (customer_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "bookings_admin_all" ON public.bookings;
CREATE POLICY "bookings_admin_all" ON public.bookings FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- WALLETS
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own" ON public.wallets FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "wallets_admin_all" ON public.wallets;
CREATE POLICY "wallets_admin_all" ON public.wallets FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- TOKEN TRANSACTIONS
DROP POLICY IF EXISTS "token_transactions_select_own" ON public.token_transactions;
CREATE POLICY "token_transactions_select_own" ON public.token_transactions FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE w.id = token_transactions.wallet_id AND w.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "token_transactions_admin_all" ON public.token_transactions;
CREATE POLICY "token_transactions_admin_all" ON public.token_transactions FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- ACTIVE SESSIONS
DROP POLICY IF EXISTS "active_sessions_select_own" ON public.active_sessions;
CREATE POLICY "active_sessions_select_own" ON public.active_sessions FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "active_sessions_admin_all" ON public.active_sessions;
CREATE POLICY "active_sessions_admin_all" ON public.active_sessions FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- ADMIN AUDIT LOGS
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- COUPONS
DROP POLICY IF EXISTS "Admins can do everything on coupons" ON public.coupons;
CREATE POLICY "Admins can do everything on coupons" ON public.coupons FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Users can read coupons" ON public.coupons;
CREATE POLICY "Users can read coupons" ON public.coupons FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- USER COUPONS
DROP POLICY IF EXISTS "Admins can do everything on user_coupons" ON public.user_coupons;
CREATE POLICY "Admins can do everything on user_coupons" ON public.user_coupons FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Users can read their own coupon redemptions" ON public.user_coupons;
CREATE POLICY "Users can read their own coupon redemptions" ON public.user_coupons FOR SELECT TO authenticated
  USING (auth.uid() = customer_id AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Users can insert their own coupon redemptions" ON public.user_coupons;
CREATE POLICY "Users can insert their own coupon redemptions" ON public.user_coupons FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id AND tenant_id = public.current_tenant_id());

-- PET TREATMENTS
DROP POLICY IF EXISTS "Users can view their own pet treatments" ON public.pet_treatments;
CREATE POLICY "Users can view their own pet treatments" ON public.pet_treatments FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.dogs d
      WHERE d.id = pet_treatments.dog_id AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can do everything on pet_treatments" ON public.pet_treatments;
CREATE POLICY "Admins can do everything on pet_treatments" ON public.pet_treatments FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- PET GALLERY
DROP POLICY IF EXISTS "Users can view their own pet gallery" ON public.pet_gallery;
CREATE POLICY "Users can view their own pet gallery" ON public.pet_gallery FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.dogs d
      WHERE d.id = pet_gallery.dog_id AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can do everything on pet_gallery" ON public.pet_gallery;
CREATE POLICY "Admins can do everything on pet_gallery" ON public.pet_gallery FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- SYSTEM SETTINGS (pubbliche per caricare le configurazioni sul sito demo/booking)
DROP POLICY IF EXISTS "Anyone can read system_settings" ON public.system_settings;
CREATE POLICY "Anyone can read system_settings" ON public.system_settings FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Admins can update system_settings" ON public.system_settings;
CREATE POLICY "Admins can update system_settings" ON public.system_settings FOR UPDATE TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());


-- 10. Aggiornamento delle funzioni RPC per supportare l'isolamento dei tenant ed i limiti di abbonamento

-- CREATE BOOKING (con controllo limiti piano LIGHT: max 100 prenotazioni/mese)
CREATE OR REPLACE FUNCTION public.create_booking(
  p_station_id uuid,
  p_dog_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_service_type public.booking_service_type default 'SELF_SERVICE'
)
RETURNS TABLE (
  booking_id uuid,
  total_credits numeric,
  status public.booking_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_plan text;
  v_bookings_count int;
  v_wallet_id uuid;
  v_balance numeric;
  v_minutes int;
  v_cost_per_minute numeric;
  v_station_cost numeric;
  v_operator_cost numeric := 0;
  v_total_credits numeric;
  v_station_status public.station_status;
  v_created_booking_id uuid;
  v_created_status public.booking_status;
  v_ends_at timestamptz;
  
  -- system settings
  v_enable_assisted boolean;
  v_price_assisted integer;
  v_enable_full boolean;
  v_price_full integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING errcode = '28000';
  END IF;

  v_tenant_id := public.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant non trovato per l''utente.' USING errcode = 'P0001';
  END IF;

  -- 10.1 Controllo Stato Abbonamento e Limite Prenotazioni Mensili
  SELECT plan, subscription_ends_at INTO v_plan, v_ends_at FROM public.tenants WHERE id = v_tenant_id;
  IF v_ends_at IS NOT NULL AND v_ends_at < now() THEN
    RAISE EXCEPTION 'L''abbonamento per questo salone è scaduto o sospeso.' USING errcode = 'P0001';
  END IF;

  IF v_plan = 'LIGHT' THEN
    SELECT COUNT(*) INTO v_bookings_count
    FROM public.bookings
    WHERE tenant_id = v_tenant_id
      AND date_trunc('month', created_at) = date_trunc('month', now());
      
    IF v_bookings_count >= 100 THEN
      RAISE EXCEPTION 'Limite mensile di prenotazioni raggiunto per questo salone (piano Light).' USING errcode = 'P0001';
    END IF;
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Intervallo orario non valido' USING errcode = '22007';
  END IF;

  SELECT s.cost_per_minute, s.status
    INTO v_cost_per_minute, v_station_status
  FROM public.stations s
  WHERE s.id = p_station_id AND s.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Postazione non trovata per questo salone.' USING errcode = 'P0002';
  END IF;

  IF v_station_status = 'MAINTENANCE' THEN
    RAISE EXCEPTION 'Postazione in manutenzione' USING errcode = 'P0001';
  END IF;

  PERFORM 1
  FROM public.dogs d
  WHERE d.id = p_dog_id
    AND d.owner_id = v_user_id
    AND d.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cane non valido' USING errcode = 'P0001';
  END IF;

  -- Leggi system settings del tenant
  SELECT enable_assisted_wash, price_assisted_wash_credits, enable_full_grooming, price_full_grooming_credits
    INTO v_enable_assisted, v_price_assisted, v_enable_full, v_price_full
  FROM public.system_settings
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Impostazioni di sistema non trovate per questo salone.' USING errcode = 'P0001';
  END IF;

  -- Valida tipo servizio e costo
  IF p_service_type = 'ASSISTED_WASH' THEN
    IF NOT v_enable_assisted THEN
       RAISE EXCEPTION 'Servizio Lavaggio Assistito non disponibile' USING errcode = 'P0001';
    END IF;
    v_operator_cost := v_price_assisted;
  ELSIF p_service_type = 'FULL_GROOMING' THEN
    IF NOT v_enable_full THEN
       RAISE EXCEPTION 'Servizio Toelettatura Completa non disponibile' USING errcode = 'P0001';
    END IF;
    v_operator_cost := v_price_full;
  END IF;

  v_minutes := greatest(1, ceil(extract(epoch from (p_end_time - p_start_time)) / 60.0)::int);
  v_station_cost := round((v_cost_per_minute * v_minutes)::numeric, 2);
  v_total_credits := v_station_cost + v_operator_cost;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_user_id AND w.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet non trovato' USING errcode = 'P0002';
  END IF;

  IF v_balance < v_total_credits THEN
    RAISE EXCEPTION 'Crediti insufficienti' USING errcode = 'P0001';
  END IF;

  UPDATE public.wallets
  SET balance_credits = round((balance_credits - v_total_credits)::numeric, 2)
  WHERE id = v_wallet_id;

  INSERT INTO public.bookings (customer_id, dog_id, station_id, start_time, end_time, status, total_credits, service_type, operator_cost_credits, tenant_id)
  VALUES (v_user_id, p_dog_id, p_station_id, p_start_time, p_end_time, 'CONFIRMED', v_total_credits, p_service_type, v_operator_cost, v_tenant_id)
  RETURNING public.bookings.id, public.bookings.status
  INTO v_created_booking_id, v_created_status;

  booking_id := v_created_booking_id;
  total_credits := v_total_credits;
  status := v_created_status;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (
    v_wallet_id, 
    v_tenant_id,
    'DEBIT', 
    v_total_credits, 
    0, 
    null, 
    CASE 
      WHEN p_service_type = 'ASSISTED_WASH' THEN 'Prenotazione Lavaggio Assistito' 
      WHEN p_service_type = 'FULL_GROOMING' THEN 'Prenotazione Toelettatura Completa'
      ELSE 'Prenotazione self-service' 
    END
  );

  RETURN NEXT;
END;
$$;


-- CANCEL BOOKING
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid
)
RETURNS TABLE (
  cancelled boolean,
  refunded boolean,
  refund_credits numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_id UUID;
  v_booking public.bookings%ROWTYPE;
  v_minutes_to_start NUMERIC;
  v_refund_ratio NUMERIC;
  v_refund_credits NUMERIC;
  v_tenant_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING errcode = '28000';
  END IF;

  v_tenant_id := public.current_tenant_id();

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.customer_id = v_user_id
    AND b.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenotazione non trovata' USING errcode = 'P0002';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'COMPLETED') THEN
    cancelled := false;
    refunded := false;
    refund_credits := 0;
    RETURN NEXT;
  END IF;

  IF v_booking.start_time <= now() THEN
    RAISE EXCEPTION 'Prenotazione gia iniziata' USING errcode = 'P0001';
  END IF;

  SELECT w.id INTO v_wallet_id
  FROM public.wallets w
  WHERE w.customer_id = v_user_id AND w.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet non trovato' USING errcode = 'P0002';
  END IF;

  v_minutes_to_start := extract(epoch from (v_booking.start_time - now())) / 60.0;

  v_refund_ratio := case
    when v_minutes_to_start >= 2880 then 1.0
    when v_minutes_to_start >= 1440 then 0.7
    when v_minutes_to_start >= 720 then 0.5
    when v_minutes_to_start >= 480 then 0.25
    else 0.0
  end;

  v_refund_credits := round((v_booking.total_credits * v_refund_ratio)::numeric, 2);

  UPDATE public.bookings
  SET status = 'CANCELLED'
  WHERE id = v_booking.id;

  cancelled := true;

  IF v_refund_credits > 0 THEN
    UPDATE public.wallets
    SET balance_credits = round((balance_credits + v_refund_credits)::numeric, 2)
    WHERE id = v_wallet_id;

    INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    VALUES (
      v_wallet_id,
      v_tenant_id,
      'BONUS',
      v_refund_credits,
      0,
      null,
      'Rimborso cancellazione ' || round((v_refund_ratio * 100)::numeric, 0)::text || '%'
    );

    refunded := true;
    refund_credits := v_refund_credits;
    RETURN NEXT;
  END IF;

  refunded := false;
  refund_credits := 0;
  RETURN NEXT;
END;
$$;


-- EXTEND BOOKING SESSION
CREATE OR REPLACE FUNCTION public.extend_booking_session(
  p_booking_id uuid,
  p_extension_minutes int,
  p_cost_credits numeric
)
RETURNS TABLE (
  extended boolean,
  new_end_time timestamptz,
  new_balance_credits numeric,
  new_remaining_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_booking public.bookings%rowtype;
  v_wallet_id uuid;
  v_balance numeric;
  v_session public.active_sessions%rowtype;
  v_new_end timestamptz;
  v_added_seconds int;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING errcode = '28000';
  END IF;

  v_tenant_id := public.current_tenant_id();

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenotazione non trovata.' USING errcode = 'P0002';
  END IF;

  IF v_booking.customer_id <> v_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorizzato.' USING errcode = '28000';
  END IF;

  IF v_booking.status <> 'CONFIRMED' AND v_booking.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Impossibile estendere una prenotazione in questo stato.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_session
  FROM public.active_sessions s
  WHERE s.booking_id = p_booking_id AND s.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessuna sessione attiva associata a questa prenotazione.' USING errcode = 'P0002';
  END IF;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_booking.customer_id AND w.tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_balance < p_cost_credits THEN
    RAISE EXCEPTION 'Saldo crediti insufficiente.' USING errcode = 'P0001';
  END IF;

  v_new_end := v_booking.end_time + (p_extension_minutes || ' minutes')::interval;

  BEGIN
    UPDATE public.bookings
    SET end_time = v_new_end
    WHERE id = p_booking_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'La postazione e occupata da un''altra prenotazione subito dopo.' USING errcode = '23P01';
  END;

  UPDATE public.wallets
  SET balance_credits = round((balance_credits - p_cost_credits)::numeric, 2)
  WHERE id = v_wallet_id
  RETURNING balance_credits INTO v_balance;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (
    v_wallet_id, 
    v_tenant_id,
    'DEBIT', 
    p_cost_credits, 
    0, 
    null, 
    'Estensione sessione (+' || p_extension_minutes || ' min) prenotazione: ' || substring(p_booking_id::text, 1, 8)
  );

  v_added_seconds := p_extension_minutes * 60;
  UPDATE public.active_sessions
  SET remaining_seconds = remaining_seconds + v_added_seconds
  WHERE id = v_session.id
  RETURNING remaining_seconds INTO v_added_seconds;

  extended := true;
  new_end_time := v_new_end;
  new_balance_credits := v_balance;
  new_remaining_seconds := v_added_seconds;
  RETURN NEXT;
END;
$$;


-- ADMIN ADJUST WALLET
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_customer_id uuid,
  p_amount_credits numeric,
  p_reason text default null
)
RETURNS TABLE (
  balance_credits numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_balance numeric;
  v_abs numeric;
  v_type public.token_transaction_type;
  v_tenant_id uuid;
  v_admin_tenant_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorizzato' USING errcode = '28000';
  END IF;

  v_admin_tenant_id := public.current_tenant_id();

  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente non trovato' USING errcode = 'P0002';
  END IF;

  IF v_admin_tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Non autorizzato a modificare il wallet di un altro salone.' USING errcode = '28000';
  END IF;

  IF p_amount_credits IS NULL OR p_amount_credits = 0 THEN
    RAISE EXCEPTION 'Importo non valido' USING errcode = '22023';
  END IF;

  v_abs := abs(p_amount_credits);
  v_type := case when p_amount_credits > 0 then 'BONUS' else 'DEBIT' end;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (p_customer_id, v_tenant_id, 0, now())
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = p_customer_id AND w.tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_balance + p_amount_credits < 0 THEN
    RAISE EXCEPTION 'Saldo insufficiente per lo storno' USING errcode = 'P0001';
  END IF;

  UPDATE public.wallets
  SET balance_credits = round((balance_credits + p_amount_credits)::numeric, 2)
  WHERE id = v_wallet_id
  RETURNING balance_credits INTO v_balance;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (v_wallet_id, v_tenant_id, v_type, v_abs, 0, null, p_reason);

  balance_credits := v_balance;
  RETURN NEXT;
END;
$$;


-- APPLY WALLET TOPUP
CREATE OR REPLACE FUNCTION public.apply_wallet_topup(
  p_amount_credits numeric,
  p_amount_currency numeric default 0,
  p_reference text default null
)
RETURNS TABLE (
  applied boolean,
  balance_credits numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_balance numeric;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING errcode = '28000';
  END IF;

  v_tenant_id := public.current_tenant_id();

  IF p_amount_credits IS NULL OR p_amount_credits <= 0 THEN
    RAISE EXCEPTION 'Importo non valido' USING errcode = '22023';
  END IF;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (v_user_id, v_tenant_id, 0, now())
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_user_id AND w.tenant_id = v_tenant_id
  FOR UPDATE;

  IF p_reference IS NOT NULL THEN
    PERFORM 1
    FROM public.token_transactions t
    WHERE t.stripe_intent_id = p_reference AND t.tenant_id = v_tenant_id;
    IF FOUND THEN
      applied := false;
      balance_credits := v_balance;
      RETURN NEXT;
    END IF;
  END IF;

  UPDATE public.wallets
  SET balance_credits = round((balance_credits + p_amount_credits)::numeric, 2)
  WHERE id = v_wallet_id
  RETURNING balance_credits INTO v_balance;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (v_wallet_id, v_tenant_id, 'CHARGE', p_amount_credits, greatest(0, coalesce(p_amount_currency, 0)), p_reference, 'Topup');

  applied := true;
  balance_credits := v_balance;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    applied := false;
    balance_credits := v_balance;
    RETURN NEXT;
END;
$$;


-- ADMIN UPDATE BOOKING STATUS
CREATE OR REPLACE FUNCTION public.admin_update_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_reason text default null
)
RETURNS TABLE (
  status public.booking_status,
  refunded boolean,
  refund_credits numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_wallet_id uuid;
  v_admin_tenant_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorizzato' USING errcode = '28000';
  END IF;

  v_admin_tenant_id := public.current_tenant_id();

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.tenant_id = v_admin_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenotazione non trovata per questo salone.' USING errcode = 'P0002';
  END IF;

  IF v_booking.status = p_status THEN
    status := v_booking.status;
    refunded := false;
    refund_credits := 0;
    RETURN NEXT;
  END IF;

  IF v_booking.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Prenotazione gia annullata' USING errcode = 'P0001';
  END IF;

  IF v_booking.status = 'COMPLETED' AND p_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Prenotazione gia completata' USING errcode = 'P0001';
  END IF;

  IF p_status = 'CANCELLED' THEN
    SELECT w.id
      INTO v_wallet_id
    FROM public.wallets w
    WHERE w.customer_id = v_booking.customer_id AND w.tenant_id = v_admin_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet non trovato' USING errcode = 'P0002';
    END IF;

    UPDATE public.bookings
    SET status = 'CANCELLED'
    WHERE id = v_booking.id;

    UPDATE public.wallets
    SET balance_credits = round((balance_credits + v_booking.total_credits)::numeric, 2)
    WHERE id = v_wallet_id;

    INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    VALUES (v_wallet_id, v_admin_tenant_id, 'BONUS', v_booking.total_credits, 0, null, coalesce(p_reason, 'Rimborso admin'));

    status := 'CANCELLED';
    refunded := true;
    refund_credits := v_booking.total_credits;
    RETURN NEXT;
  END IF;

  IF v_booking.status = 'CANCELLED' AND p_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Transizione non valida' USING errcode = 'P0001';
  END IF;

  UPDATE public.bookings
  SET status = p_status
  WHERE id = v_booking.id
  RETURNING public.bookings.status INTO status;

  refunded := false;
  refund_credits := 0;
  RETURN NEXT;
END;
$$;


-- 11. Redefinizione di get_booking_availability con filtro per tenant_id
CREATE OR REPLACE FUNCTION public.get_booking_availability(
  p_from timestamptz,
  p_to   timestamptz,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  station_id uuid,
  start_time timestamptz,
  end_time   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypassa RLS: necessario per vedere le prenotazioni di TUTTI gli utenti dell'azienda,
  -- non solo quelle dell'utente corrente.
  SET LOCAL row_security = OFF;

  RETURN QUERY
    SELECT b.station_id, b.start_time, b.end_time
    FROM public.bookings b
    WHERE b.status IN ('PENDING', 'CONFIRMED')
      AND b.start_time < p_to
      AND b.end_time   > p_from
      AND b.tenant_id = COALESCE(p_tenant_id, public.current_tenant_id());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_availability(timestamptz, timestamptz, uuid)
  TO anon, authenticated;


-- 12. Redefinizione della vista admin_customers_overview per conformarsi al Multi-Tenancy (Security Invoker)
DROP VIEW IF EXISTS public.admin_customers_overview;
CREATE OR REPLACE VIEW public.admin_customers_overview
WITH (security_invoker = true) AS
SELECT
  p.id as customer_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.tenant_id,
  w.balance_credits,
  COALESCE(COUNT(b.id), 0)::int as bookings_total,
  COALESCE(COUNT(b.id) FILTER (WHERE b.start_time >= NOW() AND b.status IN ('PENDING', 'CONFIRMED')), 0)::int as bookings_upcoming
FROM public.profiles p
LEFT JOIN public.wallets w ON w.customer_id = p.id AND w.tenant_id = p.tenant_id
LEFT JOIN public.bookings b ON b.customer_id = p.id AND b.tenant_id = p.tenant_id
GROUP BY p.id, p.email, p.first_name, p.last_name, p.phone, p.tenant_id, w.balance_credits;


