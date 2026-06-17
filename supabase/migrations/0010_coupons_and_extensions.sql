-- Migrazione 0010: Tabelle per i coupon ed RPC per riscatto ed estensione sessione.

-- 1. Tabella Coupons
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount_credits numeric not null,
  max_uses int null,
  current_uses int not null default 0,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint coupons_amount_positive check (amount_credits > 0),
  constraint coupons_uses_valid check (max_uses is null or max_uses > 0),
  constraint coupons_uses_count check (current_uses >= 0)
);

-- RLS per Coupons (solo admin può scrivere/leggere tutti, utenti leggono solo se autenticati)
alter table public.coupons enable row level security;

create policy "Admins can do everything on coupons"
  on public.coupons for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users can read coupons"
  on public.coupons for select
  to authenticated
  using (true);

-- 2. Tabella User Coupons (per tracciare quali utenti hanno usato quali coupon)
create table if not exists public.user_coupons (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_coupons_unique unique (customer_id, coupon_id)
);

-- RLS per User Coupons (utente legge i suoi, admin legge tutti)
alter table public.user_coupons enable row level security;

create policy "Admins can do everything on user_coupons"
  on public.user_coupons for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users can read their own coupon redemptions"
  on public.user_coupons for select
  to authenticated
  using (auth.uid() = customer_id);

create policy "Users can insert their own coupon redemptions"
  on public.user_coupons for insert
  to authenticated
  with check (auth.uid() = customer_id);

-- 3. RPC per Riscatto Coupon
create or replace function public.redeem_coupon_code(
  p_code text
)
returns table (
  applied boolean,
  balance_credits numeric,
  amount_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_coupon_id uuid;
  v_amount numeric;
  v_max_uses int;
  v_curr_uses int;
  v_expires timestamptz;
  v_wallet_id uuid;
  v_balance numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  -- Trova il coupon (case-insensitive)
  select id, amount_credits, max_uses, current_uses, expires_at
    into v_coupon_id, v_amount, v_max_uses, v_curr_uses, v_expires
  from public.coupons
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Codice promozionale non valido.' using errcode = 'P0002';
  end if;

  -- Controlla se scaduto
  if v_expires is not null and now() > v_expires then
    raise exception 'Codice promozionale scaduto.' using errcode = 'P0001';
  end if;

  -- Controlla se ha raggiunto il limite di utilizzi
  if v_max_uses is not null and v_curr_uses >= v_max_uses then
    raise exception 'Codice promozionale non piu disponibile.' using errcode = 'P0001';
  end if;

  -- Controlla se l'utente lo ha gia riscattato
  perform 1
  from public.user_coupons
  where customer_id = v_user_id and coupon_id = v_coupon_id;
  
  if found then
    raise exception 'Codice promozionale gia riscattato.' using errcode = 'P0001';
  end if;

  -- Inizializza il wallet se non esiste
  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (v_user_id, 0, now())
  on conflict (customer_id) do nothing;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  -- Aggiorna i contatori del coupon
  update public.coupons
  set current_uses = current_uses + 1
  where id = v_coupon_id;

  -- Registra l'utilizzo
  insert into public.user_coupons (customer_id, coupon_id)
  values (v_user_id, v_coupon_id);

  -- Aggiorna saldo wallet
  update public.wallets
  set balance_credits = round((public.wallets.balance_credits + v_amount)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  -- Registra transazione nel ledger
  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, 'BONUS', v_amount, 0, null, 'Riscatto coupon: ' || upper(trim(p_code)));

  applied := true;
  balance_credits := v_balance;
  amount_credits := v_amount;
  return next;
exception
  when unique_violation then
    applied := false;
    balance_credits := v_balance;
    amount_credits := 0;
    return next;
end;
$$;

-- Permessi RPC coupon
revoke execute on function public.redeem_coupon_code(text) from public;
grant execute on function public.redeem_coupon_code(text) to authenticated;


-- 4. RPC per Estensione Sessione
create or replace function public.extend_booking_session(
  p_booking_id uuid,
  p_extension_minutes int,
  p_cost_credits numeric
)
returns table (
  extended boolean,
  new_end_time timestamptz,
  new_balance_credits numeric,
  new_remaining_seconds int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_booking public.bookings%rowtype;
  v_wallet_id uuid;
  v_balance numeric;
  v_session public.active_sessions%rowtype;
  v_new_end timestamptz;
  v_added_seconds int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  -- 1. Trova e blocca la prenotazione
  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Prenotazione non trovata.' using errcode = 'P0002';
  end if;

  -- Permetti solo se è il proprietario o un admin
  if v_booking.customer_id <> v_user_id and not public.is_admin() then
    raise exception 'Non autorizzato.' using errcode = '28000';
  end if;

  -- Permetti estensione solo se in stato CONFIRMED o PENDING
  if v_booking.status <> 'CONFIRMED' and v_booking.status <> 'PENDING' then
    raise exception 'Impossibile estendere una prenotazione in questo stato.' using errcode = 'P0001';
  end if;

  -- 2. Trova e blocca la sessione attiva associata
  select * into v_session
  from public.active_sessions s
  where s.booking_id = p_booking_id
  for update;

  if not found then
    raise exception 'Nessuna sessione attiva associata a questa prenotazione.' using errcode = 'P0002';
  end if;

  -- 3. Controlla e blocca il wallet del cliente per scalare i crediti
  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_booking.customer_id
  for update;

  if v_balance < p_cost_credits then
    raise exception 'Saldo crediti insufficiente.' using errcode = 'P0001';
  end if;

  -- 4. Calcola il nuovo orario di fine prenotazione
  v_new_end := v_booking.end_time + (p_extension_minutes || ' minutes')::interval;

  -- 5. Prova ad aggiornare la prenotazione (il vincolo bookings_no_overlap scatterà se c'è sovrapposizione)
  begin
    update public.bookings
    set end_time = v_new_end
    where id = p_booking_id;
  exception
    when exclusion_violation then
      raise exception 'La postazione e occupata da un''altra prenotazione subito dopo.' using errcode = '23P01';
  end;

  -- 6. Addebita i crediti dal wallet
  update public.wallets
  set balance_credits = round((public.wallets.balance_credits - p_cost_credits)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  -- 7. Registra transazione nel ledger
  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, 'DEBIT', p_cost_credits, 0, null, 'Estensione sessione (+' || p_extension_minutes || ' min) prenotazione: ' || substring(p_booking_id::text, 1, 8));

  -- 8. Aggiorna i secondi rimanenti e l'attivazione della sessione
  v_added_seconds := p_extension_minutes * 60;
  update public.active_sessions
  set remaining_seconds = remaining_seconds + v_added_seconds
  where id = v_session.id
  returning public.active_sessions.remaining_seconds into v_added_seconds;

  extended := true;
  new_end_time := v_new_end;
  new_balance_credits := v_balance;
  new_remaining_seconds := v_added_seconds;
  return next;
end;
$$;

-- Permessi RPC estensione
revoke execute on function public.extend_booking_session(uuid, int, numeric) from public;
grant execute on function public.extend_booking_session(uuid, int, numeric) to authenticated;
