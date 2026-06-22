-- ============================================================
-- 0019: Fix create_booking — overlap check esplicito + gestione
--       race condition con lock pessimistico
-- ============================================================
-- PROBLEMA v0015: mancava il blocco exception per exclusion_violation,
-- e la verifica overlap avveniva DOPO la detrazione del wallet,
-- esponendo a perdita di crediti in race condition.
--
-- SOLUZIONE:
-- 1. SET LOCAL row_security = OFF per vedere le prenotazioni di tutti
-- 2. Check overlap ESPLICITO con FOR UPDATE prima di scalare il wallet
-- 3. Ripristino exception when exclusion_violation come ultima difesa
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking(
  p_station_id   uuid,
  p_dog_id       uuid,
  p_start_time   timestamptz,
  p_end_time     timestamptz,
  p_service_type public.booking_service_type DEFAULT 'SELF_SERVICE'
)
RETURNS TABLE (
  booking_id    uuid,
  total_credits numeric,
  status        public.booking_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            uuid;
  v_wallet_id          uuid;
  v_balance            numeric;
  v_minutes            int;
  v_cost_per_minute    numeric;
  v_station_cost       numeric;
  v_operator_cost      numeric := 0;
  v_total_credits      numeric;
  v_station_status     public.station_status;
  v_created_booking_id uuid;
  v_created_status     public.booking_status;
  v_enable_assisted    boolean;
  v_price_assisted     integer;
  v_enable_full        boolean;
  v_price_full         integer;
  v_overlap_count      int;
BEGIN
  -- ① Autenticazione
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING errcode = '28000';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Intervallo orario non valido' USING errcode = '22007';
  END IF;

  -- ② Verifica postazione
  SELECT s.cost_per_minute, s.status
    INTO v_cost_per_minute, v_station_status
  FROM public.stations s
  WHERE s.id = p_station_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Postazione non trovata' USING errcode = 'P0002';
  END IF;

  IF v_station_status = 'MAINTENANCE' THEN
    RAISE EXCEPTION 'Postazione in manutenzione' USING errcode = 'P0001';
  END IF;

  -- ③ Verifica cane
  PERFORM 1
  FROM public.dogs d
  WHERE d.id = p_dog_id
    AND d.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cane non valido' USING errcode = 'P0001';
  END IF;

  -- ④ CHECK OVERLAP ESPLICITO con lock pessimistico — PRIMA del wallet
  --    Bypassa RLS per vedere le prenotazioni di TUTTI gli utenti.
  --    FOR UPDATE blocca le righe conflittuali contro scritture concorrenti.
  SET LOCAL row_security = OFF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM public.bookings b
  WHERE b.station_id = p_station_id
    AND b.status IN ('PENDING', 'CONFIRMED')
    AND b.start_time < p_end_time
    AND b.end_time   > p_start_time
  FOR UPDATE;

  SET LOCAL row_security = ON;

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Slot non disponibile: postazione già occupata in questo intervallo'
      USING errcode = 'P0001';
  END IF;

  -- ⑤ Leggi system settings
  SELECT enable_assisted_wash, price_assisted_wash_credits,
         enable_full_grooming, price_full_grooming_credits
    INTO v_enable_assisted, v_price_assisted, v_enable_full, v_price_full
  FROM public.system_settings
  WHERE id = 1;

  -- ⑥ Valida service type e calcola costo operatore
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

  -- ⑦ Calcolo costo totale
  v_minutes       := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 60.0)::int);
  v_station_cost  := ROUND((v_cost_per_minute * v_minutes)::numeric, 2);
  v_total_credits := v_station_cost + v_operator_cost;

  -- ⑧ Verifica wallet con lock
  SELECT w.id, w.balance_credits
    INTO v_wallet_id, v_balance
  FROM public.wallets w
  WHERE w.customer_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet non trovato' USING errcode = 'P0002';
  END IF;

  IF v_balance < v_total_credits THEN
    RAISE EXCEPTION 'Crediti insufficienti' USING errcode = 'P0001';
  END IF;

  -- ⑨ Scala wallet
  UPDATE public.wallets
  SET balance_credits = ROUND((balance_credits - v_total_credits)::numeric, 2)
  WHERE id = v_wallet_id;

  -- ⑩ Inserisce prenotazione
  INSERT INTO public.bookings (
    customer_id, dog_id, station_id,
    start_time, end_time, status,
    total_credits, service_type, operator_cost_credits
  )
  VALUES (
    v_user_id, p_dog_id, p_station_id,
    p_start_time, p_end_time, 'CONFIRMED',
    v_total_credits, p_service_type, v_operator_cost
  )
  RETURNING public.bookings.id, public.bookings.status
  INTO v_created_booking_id, v_created_status;

  -- ⑪ Registra transazione wallet
  INSERT INTO public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (
    v_wallet_id, 'DEBIT', v_total_credits, 0, NULL,
    CASE
      WHEN p_service_type = 'ASSISTED_WASH'  THEN 'Prenotazione Lavaggio Assistito'
      WHEN p_service_type = 'FULL_GROOMING'  THEN 'Prenotazione Toelettatura Completa'
      ELSE 'Prenotazione self-service'
    END
  );

  booking_id    := v_created_booking_id;
  total_credits := v_total_credits;
  status        := v_created_status;

  RETURN NEXT;

EXCEPTION
  -- Ultima difesa: il GIST exclusion constraint cattura race condition
  -- estreme tra il check esplicito e l'INSERT
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Slot non disponibile: prenotazione già esistente'
      USING errcode = 'P0001';
END;
$$;
