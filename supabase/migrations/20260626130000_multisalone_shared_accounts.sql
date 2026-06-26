-- Migrazione 20260626130000_multisalone_shared_accounts: Transizione all'Opzione A (Account Condiviso Multisalone)
--
-- ⚠️ MIGRAZIONE DISTRUTTIVA — LEGGERE PRIMA DI APPLICARE (nota #7, claude.ai)
-- Questa migrazione ELIMINA la colonna public.profiles.tenant_id (passo 3) e modifica il
-- vincolo UNIQUE di wallets (passo 5). Operazioni NON automaticamente reversibili senza backup.
-- Prima di applicare in PRODUZIONE:
--   1) Eseguire un BACKUP completo del database (es. snapshot Supabase o `pg_dump`).
--   2) Provare la migrazione su un branch/ambiente di STAGING con dati realistici.
--   3) Tenere a portata lo script di rollback best-effort:
--      supabase/migrations/20260626130000_multisalone_shared_accounts.down.sql
--      (ATTENZIONE: il rollback NON può ricostruire dati persi; vedi note nel file).
-- Idealmente, in futuro, spezzare in due fasi: (fase 1) creare strutture + backfill mantenendo
-- profiles.tenant_id come colonna deprecata; (fase 2) drop della colonna solo dopo verifica in prod.

-- 1. Creazione della tabella junction tenant_customers
CREATE TABLE IF NOT EXISTS public.tenant_customers (
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer', 'admin'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (customer_id, tenant_id)
);

-- Abilitiamo RLS sulla tabella junction
ALTER TABLE public.tenant_customers ENABLE ROW LEVEL SECURITY;

-- Policy RLS per tenant_customers
DROP POLICY IF EXISTS "Users can view their own tenant memberships" ON public.tenant_customers;
CREATE POLICY "Users can view their own tenant memberships" ON public.tenant_customers
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- FIX #5 (claude.ai): la vecchia policy era FOR ALL ed era basata sul modello legacy
-- (raw_app_meta_data.role / .tenant_id), incoerente con il nuovo modello in cui il ruolo
-- per-salone vive in tenant_customers.role. Inoltre, essendo FOR ALL con solo USING,
-- Postgres riusava la USING anche come WITH CHECK: un admin di salone poteva quindi
-- INSERIRE/MODIFICARE appartenenze (es. auto-promuoversi). La separiamo in:
--   (a) lettura per gli admin del proprio salone (modello nuovo: is_admin + tenant corrente)
--   (b) scrittura riservata al solo superadmin
-- Nota operativa: tutte le scritture "legittime" su tenant_customers avvengono via
-- service-role (callback OAuth, webhook Stripe, server action superadmin) o via funzioni
-- SECURITY DEFINER (handle_new_user, init_tenant_customer_if_needed), che BYPASSANO la RLS.
-- Quindi restringere la scrittura lato utente autenticato non rompe alcun flusso applicativo,
-- ma chiude la porta a chiamate dirette malevole verso PostgREST.

-- (a) Lettura: un admin può vedere le appartenenze del salone che sta gestendo.
DROP POLICY IF EXISTS "Admins can view tenant memberships of their own salon" ON public.tenant_customers;
CREATE POLICY "Admins can view tenant memberships of their own salon" ON public.tenant_customers
  FOR SELECT TO authenticated
  USING (
    public.is_admin() AND tenant_id = public.current_tenant_id()
  );

-- (b) Scrittura (INSERT/UPDATE/DELETE): solo superadmin. I tenant-admin gestiscono lo staff
-- tramite le server action superadmin (service-role), non con scritture dirette dal browser.
DROP POLICY IF EXISTS "Superadmin can manage tenant memberships" ON public.tenant_customers;
CREATE POLICY "Superadmin can manage tenant memberships" ON public.tenant_customers
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

-- 2. Migrazione dei dati storici delle associazioni tenant a tenant_customers
INSERT INTO public.tenant_customers (customer_id, tenant_id, role)
SELECT id, tenant_id, 'customer' FROM public.profiles
WHERE tenant_id IS NOT NULL
ON CONFLICT (customer_id, tenant_id) DO NOTHING;

-- Copia dei ruoli admin esistenti nei metadati di auth
INSERT INTO public.tenant_customers (customer_id, tenant_id, role)
SELECT id, (raw_app_meta_data ->> 'tenant_id')::UUID, 'admin'
FROM auth.users
WHERE (raw_app_meta_data ->> 'role') = 'admin' AND (raw_app_meta_data ->> 'tenant_id') IS NOT NULL
ON CONFLICT (customer_id, tenant_id) DO UPDATE SET role = 'admin';

-- 3. Rimozione della colonna tenant_id da public.profiles (previa rimozione di policy e viste)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP VIEW IF EXISTS public.admin_customers_overview;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS tenant_id;

-- 4. Ricreazione RLS Policies su profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Permette ad un utente di inserire il proprio profilo su signup
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_admin() AND 
    EXISTS (
      SELECT 1 FROM public.tenant_customers tc 
      WHERE tc.customer_id = public.profiles.id AND tc.tenant_id = public.current_tenant_id()
    )
  );

-- 5. Riconfigurazione del vincolo UNIQUE sulla tabella wallets (chiave composta)
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_customer_id_key;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_customer_tenant_uq UNIQUE (customer_id, tenant_id);

-- 6. Riscrittura di current_tenant_id() per leggere x-tenant-id dagli headers
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  -- Tenta prima di leggere l'header HTTP personalizzato inviato dal server Next.js
  v_tenant_id := current_setting('request.headers', true)::jsonb ->> 'x-tenant-id';
  IF v_tenant_id IS NOT NULL AND v_tenant_id <> '' THEN
    RETURN v_tenant_id::UUID;
  END IF;
  -- NESSUN fallback su user_metadata: è modificabile dall'utente (auth.updateUser) e
  -- permetterebbe lo spoofing del tenant. Senza header affidabile restituiamo NULL,
  -- così le policy RLS falliscono in modo sicuro (fail-closed).
  RETURN NULL;
END;
$$;

-- 7. Riscrittura di is_admin() basata sul ruolo in tenant_customers per il salone corrente
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Il superadmin scavalca tutte le restrizioni
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  v_tenant_id := public.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.tenant_customers
    WHERE customer_id = auth.uid()
      AND tenant_id = v_tenant_id
      AND role = 'admin'
  );
END;
$$;

-- 8. Creazione della funzione helper init_tenant_customer_if_needed
CREATE OR REPLACE FUNCTION public.init_tenant_customer_if_needed(
  p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- La RPC è SECURITY DEFINER e chiamabile direttamente con qualunque p_tenant_id:
  -- validiamo che il tenant esista davvero prima di creare l'appartenenza.
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RETURN;
  END IF;

  -- 1. Inserisci la relazione in tenant_customers se non esiste
  INSERT INTO public.tenant_customers (customer_id, tenant_id, role)
  VALUES (v_user_id, p_tenant_id, 'customer')
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;

  -- 2. Inserisci il portafoglio a saldo 0 per questo tenant.
  -- NESSUN bonus automatico: l'auto-join alla semplice visita di un salone non deve
  -- regalare crediti (altrimenti un utente "farma" il bonus visitando ogni salone).
  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (v_user_id, p_tenant_id, 0, now())
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;
END;
$$;

-- 8.5. Funzione CONDIVISA di provisioning "primo accesso a un salone" + bonus benvenuto.
-- (claude.ai) Unifica la logica del bonus usata sia dal trigger handle_new_user (signup email)
-- sia dal callback OAuth (service-role). Avere UNA sola fonte di verità garantisce che:
--   - il bonus sia identico per email e OAuth (coerenza);
--   - sia UNA-TANTUM per coppia (utente, salone) → niente farming, niente doppio accredito;
--   - venga SEMPRE registrato nel ledger token_transactions (tracciabilità).
-- Differenza rispetto a init_tenant_customer_if_needed: quella crea l'appartenenza SENZA bonus
-- (auto-join alla semplice visita di un salone); questa concede il bonus di benvenuto ed è quindi
-- riservata ai soli contesti fidati (vedi REVOKE/GRANT in fondo).
CREATE OR REPLACE FUNCTION public.provision_tenant_welcome(
  p_user_id UUID,
  p_tenant_id UUID,
  p_welcome_credits NUMERIC DEFAULT 2
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  -- Parametri non validi: usciamo silenziosamente (chiamata idempotente/no-op).
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Provisioning solo verso tenant esistenti: evita FK violation e accrediti su saloni fantasma.
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RETURN;
  END IF;

  -- 1. Appartenenza al salone (idempotente).
  INSERT INTO public.tenant_customers (customer_id, tenant_id, role)
  VALUES (p_user_id, p_tenant_id, 'customer')
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;

  -- 2. Wallet del salone. ON CONFLICT DO NOTHING: il RETURNING valorizza v_wallet_id SOLO
  -- quando il wallet viene davvero CREATO ora. Così il bonus e la riga di ledger scattano
  -- una sola volta per (utente, salone), anche se la funzione viene richiamata più volte.
  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (p_user_id, p_tenant_id, p_welcome_credits, timezone('utc'::text, now()))
  ON CONFLICT (customer_id, tenant_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  -- 3. Bonus di benvenuto nel ledger, solo se il wallet è stato appena creato.
  IF v_wallet_id IS NOT NULL THEN
    INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, created_at)
    VALUES (v_wallet_id, p_tenant_id, 'BONUS', p_welcome_credits, 0, null, timezone('utc'::text, now()));
  END IF;
END;
$$;

-- Sicurezza: concedere il bonus è un'operazione "fidata". La esponiamo SOLO al service_role
-- (callback OAuth, server action) e la revochiamo a anon/authenticated, così un utente NON può
-- chiamarla direttamente via PostgREST per auto-accreditarsi crediti su saloni arbitrari.
-- Il trigger handle_new_user può comunque invocarla: gira come owner (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.provision_tenant_welcome(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_tenant_welcome(UUID, UUID, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_welcome(UUID, UUID, NUMERIC) TO service_role;

-- 9. Riscrittura di handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  welcome_credits NUMERIC := 2;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := (new.raw_user_meta_data ->> 'tenant_id')::UUID;

  -- Crea profilo pubblico globale
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (new.id, new.email, timezone('utc'::text, now()))
  ON CONFLICT (id) DO NOTHING;

  -- Provisioning del salone di registrazione + bonus di benvenuto tramite la funzione CONDIVISA.
  -- provision_tenant_welcome gestisce internamente i casi tenant NULL / inesistente (no-op),
  -- quindi non serve più duplicare qui i controlli né la logica del bonus (vedi passo 8.5).
  PERFORM public.provision_tenant_welcome(new.id, v_tenant_id, welcome_credits);

  RETURN new;
END;
$$;

-- 10. Riscrittura di redeem_coupon_code()
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

  PERFORM 1
  FROM public.user_coupons
  WHERE customer_id = v_user_id AND coupon_id = v_coupon_id;
  
  if found then
    raise exception 'Codice promozionale gia riscattato.' using errcode = 'P0001';
  end if;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (v_user_id, v_tenant_id, 0, timezone('utc'::text, now()))
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;

  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_user_id AND w.tenant_id = v_tenant_id
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

-- 11. Riscrittura di admin_adjust_wallet()
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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorizzato' USING errcode = '28000';
  END IF;

  v_tenant_id := public.current_tenant_id();

  IF p_amount_credits IS NULL OR p_amount_credits = 0 THEN
    RAISE EXCEPTION 'Importo non valido' USING errcode = '22023';
  END IF;

  v_abs := abs(p_amount_credits);
  v_type := case when p_amount_credits > 0 then 'BONUS' else 'DEBIT' end;

  INSERT INTO public.wallets (customer_id, tenant_id, balance_credits, updated_at)
  VALUES (p_customer_id, v_tenant_id, 0, now())
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;

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

-- 12. Riscrittura di apply_wallet_topup()
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
  ON CONFLICT (customer_id, tenant_id) DO NOTHING;

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

-- 13. Ricreazione della vista admin_customers_overview conforme a tenant_customers
CREATE OR REPLACE VIEW public.admin_customers_overview
WITH (security_invoker = true) AS
SELECT
  tc.customer_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  tc.tenant_id,
  w.balance_credits,
  COALESCE(COUNT(b.id), 0)::int as bookings_total,
  COALESCE(COUNT(b.id) FILTER (WHERE b.start_time >= NOW() AND b.status IN ('PENDING', 'CONFIRMED')), 0)::int as bookings_upcoming
FROM public.tenant_customers tc
JOIN public.profiles p ON p.id = tc.customer_id
LEFT JOIN public.wallets w ON w.customer_id = tc.customer_id AND w.tenant_id = tc.tenant_id
LEFT JOIN public.bookings b ON b.customer_id = tc.customer_id AND b.tenant_id = tc.tenant_id
GROUP BY tc.customer_id, p.email, p.first_name, p.last_name, p.phone, tc.tenant_id, w.balance_credits;

-- 14. Hardening lettura coupon: l'header x-tenant-id lato browser è impostabile dall'utente.
-- La vecchia policy concedeva la lettura col solo tenant_id corrente, permettendo a un utente
-- loggato di leggere i coupon di un ALTRO salone falsificando l'header. La leghiamo all'appartenenza reale.
DROP POLICY IF EXISTS "Users can read coupons" ON public.coupons;
CREATE POLICY "Users can read coupons" ON public.coupons FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.tenant_customers tc
      WHERE tc.customer_id = auth.uid() AND tc.tenant_id = public.coupons.tenant_id
    )
  );
