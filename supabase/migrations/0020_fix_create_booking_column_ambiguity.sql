-- ============================================================
-- 0020: Fix "column reference total_credits is ambiguous"
--       in create_booking (bug introdotto in 0015).
--
-- CAUSA: in una funzione RETURNS TABLE, i nomi delle colonne
-- di output ('booking_id', 'total_credits', 'status') diventano
-- variabili locali PL/pgSQL. Quando un'istruzione SQL all'interno
-- della funzione usa gli stessi nomi come colonne di tabella
-- (es. INSERT INTO bookings (..., total_credits, ...)),
-- PostgreSQL non riesce a distinguerli → ambiguity error.
--
-- SOLUZIONE: Qualificare con alias di tabella TUTTE le colonne
-- che coincidono con i nomi degli output param nel corpo SQL.
-- Usare variabili v_ per tutti i valori intermedi.
-- Mantenere il check overlap anti-overbooking di 0019.
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
  v_total_credits      numeric;     -- variabile interna (non output param)
  v_station_status     public.station_status;
  v_created_booking_id uuid;
  v_created_status     public.booking_status;
  v_enable_assisted    boolean;
  v_price_assisted     integer;
  v_enable_full        boolean;
  v_price_full         integer;
  v_overlap_exists     boolean := false;
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

  -- ③ Verifica cane appartiene all'utente
  PERFORM 1
  FROM public.dogs d
  WHERE d.id = p_dog_id
    AND d.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cane non valido' USING errcode = 'P0001';
  END IF;

  -- ④ Check overlap anti-overbooking con bypass RLS
  --    Vede le prenotazioni di TUTTI gli utenti, non solo le proprie.
  SET LOCAL row_security = OFF;

  PERFORM 1
  FROM public.bookings bk
  WHERE bk.station_id = p_station_id
    AND bk.status IN ('PENDING', 'CONFIRMED')
    AND bk.start_time < p_end_time
    AND bk.end_time   > p_start_time
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SET LOCAL row_security = ON;
    RAISE EXCEPTION 'Slot non disponibile: postazione gia occupata in questo intervallo'
      USING errcode = 'P0001';
  END IF;

  SET LOCAL row_security = ON;

  -- ⑤ Leggi system settings
  SELECT ss.enable_assisted_wash, ss.price_assisted_wash_credits,
         ss.enable_full_grooming, ss.price_full_grooming_credits
    INTO v_enable_assisted, v_price_assisted, v_enable_full, v_price_full
  FROM public.system_settings ss
  WHERE ss.id = 1;

  -- ⑥ Calcola costo operatore in base al service type
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

  -- ⑧ Blocca wallet e verifica saldo
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
  UPDATE public.wallets w
  SET balance_credits = ROUND((w.balance_credits - v_total_credits)::numeric, 2)
  WHERE w.id = v_wallet_id;

  -- ⑩ Inserisce booking
  --    NOTA: le colonne 'status' e 'total_credits' dell'INSERT sono nomi
  --    di colonna della tabella, non i parametri di output.
  --    Usiamo variabili v_ nei VALUES per evitare ogni ambiguità.
  INSERT INTO public.bookings AS bk (
    customer_id, dog_id, station_id,
    start_time,   end_time,
    status,       total_credits,
    service_type, operator_cost_credits
  )
  VALUES (
    v_user_id,      p_dog_id,        p_station_id,
    p_start_time,   p_end_time,
    'CONFIRMED',    v_total_credits,
    p_service_type, v_operator_cost
  )
  RETURNING bk.id, bk.status
  INTO v_created_booking_id, v_created_status;

  -- ⑪ Registra transazione wallet
  INSERT INTO public.token_transactions (
    wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note
  )
  VALUES (
    v_wallet_id, 'DEBIT', v_total_credits, 0, NULL,
    CASE
      WHEN p_service_type = 'ASSISTED_WASH' THEN 'Prenotazione Lavaggio Assistito'
      WHEN p_service_type = 'FULL_GROOMING' THEN 'Prenotazione Toelettatura Completa'
      ELSE 'Prenotazione self-service'
    END
  );

  -- ⑫ Assegna i parametri di output (nomi distinti dai DECLARE interni)
  booking_id    := v_created_booking_id;
  total_credits := v_total_credits;       -- output param ← variabile interna
  status        := v_created_status;

  RETURN NEXT;

EXCEPTION
  -- Ultima difesa contro race condition estrema tra il PERFORM e l'INSERT
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Slot non disponibile: prenotazione gia esistente'
      USING errcode = 'P0001';
END;
$$;
