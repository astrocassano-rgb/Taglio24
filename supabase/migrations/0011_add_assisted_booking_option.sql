-- Migrazione 0011: Aggiunta opzione assistita (servizio ibrido) per le prenotazioni.

-- 1. Aggiunge la colonna assisted alla tabella bookings
alter table public.bookings add column if not exists assisted boolean not null default false;

-- 2. Aggiorna la funzione create_booking per supportare p_assisted
create or replace function public.create_booking(
  p_station_id uuid,
  p_dog_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_assisted boolean default false
)
returns table (
  booking_id uuid,
  total_credits numeric,
  status public.booking_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_balance numeric;
  v_minutes int;
  v_cost_per_minute numeric;
  v_total_credits numeric;
  v_station_status public.station_status;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'Intervallo orario non valido' using errcode = '22007';
  end if;

  select s.cost_per_minute, s.status
    into v_cost_per_minute, v_station_status
  from public.stations s
  where s.id = p_station_id;

  if not found then
    raise exception 'Postazione non trovata' using errcode = 'P0002';
  end if;

  if v_station_status = 'MAINTENANCE' then
    raise exception 'Postazione in manutenzione' using errcode = 'P0001';
  end if;

  perform 1
  from public.dogs d
  where d.id = p_dog_id
    and d.owner_id = v_user_id;

  if not found then
    raise exception 'Cane non valido' using errcode = 'P0001';
  end if;

  v_minutes := greatest(1, ceil(extract(epoch from (p_end_time - p_start_time)) / 60.0)::int);
  v_total_credits := round((v_cost_per_minute * v_minutes)::numeric, 2);
  
  -- Se è richiesto il servizio assistito, aggiunge il sovrapprezzo fisso di 15 crediti
  if p_assisted then
    v_total_credits := v_total_credits + 15;
  end if;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if v_balance < v_total_credits then
    raise exception 'Crediti insufficienti' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance_credits = round((balance_credits - v_total_credits)::numeric, 2)
  where id = v_wallet_id;

  insert into public.bookings (customer_id, dog_id, station_id, start_time, end_time, status, total_credits, assisted)
  values (v_user_id, p_dog_id, p_station_id, p_start_time, p_end_time, 'CONFIRMED', v_total_credits, p_assisted)
  returning id, total_credits, status
  into booking_id, total_credits, status;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (
    v_wallet_id, 
    'DEBIT', 
    v_total_credits, 
    0, 
    null, 
    case when p_assisted then 'Prenotazione assistita (ibrida)' else 'Prenotazione self-service' end
  );

  return next;
end;
$$;
