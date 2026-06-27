-- SCHEMA COMPLETO DI TAGLIO24
-- Generato automaticamente il 27/06/2026
-- Questo file contiene tutte le migrazioni unite ed ordinate per una configurazione pulita.


-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0001_init.sql
-- --------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.dog_size as enum ('SMALL', 'MEDIUM', 'LARGE', 'GIANT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.station_type as enum ('WASH_BASIN', 'DRYING_ZONE', 'GROOMING_TABLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.station_status as enum ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.token_transaction_type as enum ('CHARGE', 'DEBIT', 'BONUS');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text null,
  last_name text null,
  phone text null,
  email text null,
  avatar_url text null,
  created_at timestamptz not null default now()
);

create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  breed text null,
  size public.dog_size not null,
  weight numeric null,
  notes text null,
  photo_url text null,
  created_at timestamptz not null default now(),
  constraint dogs_weight_nonnegative check (weight is null or weight >= 0)
);

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.station_type not null,
  status public.station_status not null default 'AVAILABLE',
  cost_per_minute numeric not null,
  created_at timestamptz not null default now(),
  constraint stations_cost_per_minute_positive check (cost_per_minute > 0)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete restrict,
  station_id uuid not null references public.stations (id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.booking_status not null default 'PENDING',
  total_credits numeric not null,
  created_at timestamptz not null default now(),
  constraint bookings_time_valid check (end_time > start_time),
  constraint bookings_total_credits_nonnegative check (total_credits >= 0)
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.profiles (id) on delete cascade,
  balance_credits numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_balance_nonnegative check (balance_credits >= 0)
);

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  type public.token_transaction_type not null,
  amount_credits numeric not null,
  amount_currency numeric not null,
  stripe_intent_id text null,
  created_at timestamptz not null default now(),
  constraint token_transactions_amounts_nonnegative check (amount_credits >= 0 and amount_currency >= 0)
);

create unique index if not exists token_transactions_stripe_intent_id_uq
  on public.token_transactions (stripe_intent_id)
  where stripe_intent_id is not null;

create table if not exists public.active_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings (id) on delete set null,
  station_id uuid not null references public.stations (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  remaining_seconds int not null,
  is_paused boolean not null default false,
  activated_at timestamptz not null default now(),
  constraint active_sessions_remaining_seconds_nonnegative check (remaining_seconds >= 0)
);

create index if not exists dogs_owner_id_idx on public.dogs (owner_id);
create index if not exists bookings_customer_id_idx on public.bookings (customer_id);
create index if not exists bookings_station_id_start_time_idx on public.bookings (station_id, start_time);
create index if not exists wallets_customer_id_idx on public.wallets (customer_id);
create index if not exists token_transactions_wallet_id_idx on public.token_transactions (wallet_id);
create index if not exists active_sessions_station_id_idx on public.active_sessions (station_id);
create index if not exists active_sessions_customer_id_idx on public.active_sessions (customer_id);

do $$ begin
  alter table public.bookings
    add constraint bookings_no_overlap
    exclude using gist (
      station_id with =,
      tstzrange(start_time, end_time, '[)') with &&
    )
    where (status in ('PENDING', 'CONFIRMED'));
exception when duplicate_object then null; end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wallets_touch_updated_at on public.wallets;
create trigger wallets_touch_updated_at
before update on public.wallets
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_wallet_id uuid;
  welcome_credits numeric := 2;
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;

  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (new.id, welcome_credits, now())
  on conflict (customer_id) do update
    set balance_credits = greatest(public.wallets.balance_credits, excluded.balance_credits),
        updated_at = now()
  returning id into new_wallet_id;

  if new_wallet_id is not null then
    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, created_at)
    values (new_wallet_id, 'BONUS', welcome_credits, 0, null, now());
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.stations enable row level security;
alter table public.bookings enable row level security;
alter table public.wallets enable row level security;
alter table public.token_transactions enable row level security;
alter table public.active_sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "dogs_select_own" on public.dogs;
create policy "dogs_select_own"
on public.dogs for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "dogs_insert_own" on public.dogs;
create policy "dogs_insert_own"
on public.dogs for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "dogs_update_own" on public.dogs;
create policy "dogs_update_own"
on public.dogs for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "dogs_delete_own" on public.dogs;
create policy "dogs_delete_own"
on public.dogs for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "stations_select_auth" on public.stations;
create policy "stations_select_auth"
on public.stations for select
to authenticated
using (true);

drop policy if exists "stations_admin_write" on public.stations;
create policy "stations_admin_write"
on public.stations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own"
on public.bookings for select
to authenticated
using (customer_id = auth.uid());

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own"
on public.bookings for insert
to authenticated
with check (customer_id = auth.uid());

drop policy if exists "bookings_update_own" on public.bookings;
create policy "bookings_update_own"
on public.bookings for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists "bookings_admin_all" on public.bookings;
create policy "bookings_admin_all"
on public.bookings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own"
on public.wallets for select
to authenticated
using (customer_id = auth.uid());

drop policy if exists "wallets_admin_all" on public.wallets;
create policy "wallets_admin_all"
on public.wallets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "token_transactions_select_own" on public.token_transactions;
create policy "token_transactions_select_own"
on public.token_transactions for select
to authenticated
using (
  exists (
    select 1
    from public.wallets w
    where w.id = token_transactions.wallet_id
      and w.customer_id = auth.uid()
  )
);

drop policy if exists "token_transactions_admin_all" on public.token_transactions;
create policy "token_transactions_admin_all"
on public.token_transactions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "active_sessions_select_own" on public.active_sessions;
create policy "active_sessions_select_own"
on public.active_sessions for select
to authenticated
using (customer_id = auth.uid());

drop policy if exists "active_sessions_admin_all" on public.active_sessions;
create policy "active_sessions_admin_all"
on public.active_sessions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.create_booking(
  p_station_id uuid,
  p_dog_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
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

  insert into public.bookings (customer_id, dog_id, station_id, start_time, end_time, status, total_credits)
  values (v_user_id, p_dog_id, p_station_id, p_start_time, p_end_time, 'CONFIRMED', v_total_credits)
  returning id, total_credits, status
  into booking_id, total_credits, status;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id)
  values (v_wallet_id, 'DEBIT', v_total_credits, 0, null);

  return next;
exception
  when exclusion_violation then
    raise exception 'Slot non disponibile' using errcode = 'P0001';
end;
$$;

create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns table (
  cancelled boolean,
  refunded boolean,
  refund_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = v_user_id;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.status in ('CANCELLED', 'COMPLETED') then
    cancelled := false;
    refunded := false;
    refund_credits := 0;
    return next;
  end if;

  select w.id into v_wallet_id
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  update public.bookings
  set status = 'CANCELLED'
  where id = v_booking.id;

  cancelled := true;

  if v_booking.start_time - now() >= interval '2 hours' then
    update public.wallets
    set balance_credits = round((balance_credits + v_booking.total_credits)::numeric, 2)
    where id = v_wallet_id;

    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id)
    values (v_wallet_id, 'BONUS', v_booking.total_credits, 0, null);

    refunded := true;
    refund_credits := v_booking.total_credits;
    return next;
  end if;

  refunded := false;
  refund_credits := 0;
  return next;
end;
$$;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0002_booking_availability.sql
-- --------------------------------------------------

create or replace function public.get_booking_availability(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  station_id uuid,
  start_time timestamptz,
  end_time timestamptz
)
language sql
security definer
set search_path = public
as $$
  select b.station_id, b.start_time, b.end_time
  from public.bookings b
  where b.status in ('PENDING', 'CONFIRMED')
    and b.start_time < p_to
    and b.end_time > p_from;
$$;

grant execute on function public.get_booking_availability(timestamptz, timestamptz) to anon, authenticated;

drop policy if exists "stations_select_public" on public.stations;
create policy "stations_select_public"
on public.stations for select
to anon
using (true);



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0003_privacy_security_hardening.sql
-- --------------------------------------------------

drop policy if exists "bookings_insert_own" on public.bookings;
drop policy if exists "bookings_update_own" on public.bookings;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.create_booking(uuid, uuid, timestamptz, timestamptz) to authenticated;

revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated;




-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0004_fix_create_booking_ambiguity.sql
-- --------------------------------------------------

create or replace function public.create_booking(
  p_station_id uuid,
  p_dog_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
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
  v_charge_credits numeric;
  v_station_status public.station_status;
  v_created_booking_id uuid;
  v_created_status public.booking_status;
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
  v_charge_credits := round((v_cost_per_minute * v_minutes)::numeric, 2);

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if v_balance < v_charge_credits then
    raise exception 'Crediti insufficienti' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance_credits = round((balance_credits - v_charge_credits)::numeric, 2)
  where id = v_wallet_id;

  insert into public.bookings (customer_id, dog_id, station_id, start_time, end_time, status, total_credits)
  values (v_user_id, p_dog_id, p_station_id, p_start_time, p_end_time, 'CONFIRMED', v_charge_credits)
  returning public.bookings.id, public.bookings.status
  into v_created_booking_id, v_created_status;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id)
  values (v_wallet_id, 'DEBIT', v_charge_credits, 0, null);

  booking_id := v_created_booking_id;
  total_credits := v_charge_credits;
  status := v_created_status;
  return next;
exception
  when exclusion_violation then
    raise exception 'Slot non disponibile' using errcode = 'P0001';
end;
$$;




-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0005_admin_and_wallet.sql
-- --------------------------------------------------

alter table public.token_transactions
add column if not exists note text null;

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "dogs_admin_all" on public.dogs;
create policy "dogs_admin_all"
on public.dogs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.admin_adjust_wallet(
  p_customer_id uuid,
  p_amount_credits numeric,
  p_reason text default null
)
returns table (
  balance_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_balance numeric;
  v_abs numeric;
  v_type public.token_transaction_type;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '28000';
  end if;

  if p_amount_credits is null or p_amount_credits = 0 then
    raise exception 'Importo non valido' using errcode = '22023';
  end if;

  v_abs := abs(p_amount_credits);
  v_type := case when p_amount_credits > 0 then 'BONUS' else 'DEBIT' end;

  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (p_customer_id, 0, now())
  on conflict (customer_id) do nothing;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if v_balance + p_amount_credits < 0 then
    raise exception 'Saldo insufficiente per lo storno' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance_credits = round((public.wallets.balance_credits + p_amount_credits)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, v_type, v_abs, 0, null, p_reason);

  balance_credits := v_balance;
  return next;
end;
$$;

create or replace function public.apply_wallet_topup(
  p_amount_credits numeric,
  p_amount_currency numeric default 0,
  p_reference text default null
)
returns table (
  applied boolean,
  balance_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_balance numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  if p_amount_credits is null or p_amount_credits <= 0 then
    raise exception 'Importo non valido' using errcode = '22023';
  end if;

  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (v_user_id, 0, now())
  on conflict (customer_id) do nothing;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if p_reference is not null then
    perform 1
    from public.token_transactions t
    where t.stripe_intent_id = p_reference;
    if found then
      applied := false;
      balance_credits := v_balance;
      return next;
    end if;
  end if;

  update public.wallets
  set balance_credits = round((public.wallets.balance_credits + p_amount_credits)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, 'CHARGE', p_amount_credits, greatest(0, coalesce(p_amount_currency, 0)), p_reference, 'Topup');

  applied := true;
  balance_credits := v_balance;
  return next;
exception
  when unique_violation then
    applied := false;
    balance_credits := v_balance;
    return next;
end;
$$;

create or replace function public.admin_update_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_reason text default null
)
returns table (
  status public.booking_status,
  refunded boolean,
  refund_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_wallet_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '28000';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.status = p_status then
    status := v_booking.status;
    refunded := false;
    refund_credits := 0;
    return next;
  end if;

  if v_booking.status = 'CANCELLED' then
    raise exception 'Prenotazione gia annullata' using errcode = 'P0001';
  end if;

  if v_booking.status = 'COMPLETED' and p_status <> 'COMPLETED' then
    raise exception 'Prenotazione gia completata' using errcode = 'P0001';
  end if;

  if p_status = 'CANCELLED' then
    select w.id
      into v_wallet_id
    from public.wallets w
    where w.customer_id = v_booking.customer_id
    for update;

    if not found then
      raise exception 'Wallet non trovato' using errcode = 'P0002';
    end if;

    update public.bookings
    set status = 'CANCELLED'
    where id = v_booking.id;

    update public.wallets
    set balance_credits = round((public.wallets.balance_credits + v_booking.total_credits)::numeric, 2)
    where id = v_wallet_id;

    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    values (v_wallet_id, 'BONUS', v_booking.total_credits, 0, null, coalesce(p_reason, 'Rimborso admin'));

    status := 'CANCELLED';
    refunded := true;
    refund_credits := v_booking.total_credits;
    return next;
  end if;

  if v_booking.status = 'CANCELLED' and p_status <> 'CANCELLED' then
    raise exception 'Transizione non valida' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = p_status
  where id = v_booking.id
  returning public.bookings.status into status;

  refunded := false;
  refund_credits := 0;
  return next;
end;
$$;

create or replace view public.admin_customers_overview as
select
  p.id as customer_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  w.balance_credits,
  coalesce(count(b.id), 0)::int as bookings_total,
  coalesce(count(b.id) filter (where b.start_time >= now() and b.status in ('PENDING', 'CONFIRMED')), 0)::int as bookings_upcoming
from public.profiles p
left join public.wallets w on w.customer_id = p.id
left join public.bookings b on b.customer_id = p.id
group by p.id, p.email, p.first_name, p.last_name, p.phone, w.balance_credits;

revoke execute on function public.admin_adjust_wallet(uuid, numeric, text) from public;
grant execute on function public.admin_adjust_wallet(uuid, numeric, text) to authenticated;

revoke execute on function public.admin_update_booking_status(uuid, public.booking_status, text) from public;
grant execute on function public.admin_update_booking_status(uuid, public.booking_status, text) to authenticated;

revoke execute on function public.apply_wallet_topup(numeric, numeric, text) from public;
grant execute on function public.apply_wallet_topup(numeric, numeric, text) to authenticated;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0006_fix_wallet_rpc_ambiguity.sql
-- --------------------------------------------------

create or replace function public.admin_adjust_wallet(
  p_customer_id uuid,
  p_amount_credits numeric,
  p_reason text default null
)
returns table (
  balance_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_balance numeric;
  v_abs numeric;
  v_type public.token_transaction_type;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '28000';
  end if;

  if p_amount_credits is null or p_amount_credits = 0 then
    raise exception 'Importo non valido' using errcode = '22023';
  end if;

  v_abs := abs(p_amount_credits);
  v_type := case when p_amount_credits > 0 then 'BONUS' else 'DEBIT' end;

  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (p_customer_id, 0, now())
  on conflict (customer_id) do nothing;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if v_balance + p_amount_credits < 0 then
    raise exception 'Saldo insufficiente per lo storno' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance_credits = round((public.wallets.balance_credits + p_amount_credits)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, v_type, v_abs, 0, null, p_reason);

  balance_credits := v_balance;
  return next;
end;
$$;

create or replace function public.apply_wallet_topup(
  p_amount_credits numeric,
  p_amount_currency numeric default 0,
  p_reference text default null
)
returns table (
  applied boolean,
  balance_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_balance numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  if p_amount_credits is null or p_amount_credits <= 0 then
    raise exception 'Importo non valido' using errcode = '22023';
  end if;

  insert into public.wallets (customer_id, balance_credits, updated_at)
  values (v_user_id, 0, now())
  on conflict (customer_id) do nothing;

  select w.id, w.balance_credits
    into v_wallet_id, v_balance
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  if p_reference is not null then
    perform 1
    from public.token_transactions t
    where t.stripe_intent_id = p_reference;
    if found then
      applied := false;
      balance_credits := v_balance;
      return next;
    end if;
  end if;

  update public.wallets
  set balance_credits = round((public.wallets.balance_credits + p_amount_credits)::numeric, 2)
  where id = v_wallet_id
  returning public.wallets.balance_credits into v_balance;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (v_wallet_id, 'CHARGE', p_amount_credits, greatest(0, coalesce(p_amount_currency, 0)), p_reference, 'Topup');

  applied := true;
  balance_credits := v_balance;
  return next;
exception
  when unique_violation then
    applied := false;
    balance_credits := v_balance;
    return next;
end;
$$;

create or replace function public.admin_update_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_reason text default null
)
returns table (
  status public.booking_status,
  refunded boolean,
  refund_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_wallet_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '28000';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.status = p_status then
    status := v_booking.status;
    refunded := false;
    refund_credits := 0;
    return next;
  end if;

  if v_booking.status = 'CANCELLED' then
    raise exception 'Prenotazione gia annullata' using errcode = 'P0001';
  end if;

  if v_booking.status = 'COMPLETED' and p_status <> 'COMPLETED' then
    raise exception 'Prenotazione gia completata' using errcode = 'P0001';
  end if;

  if p_status = 'CANCELLED' then
    select w.id
      into v_wallet_id
    from public.wallets w
    where w.customer_id = v_booking.customer_id
    for update;

    if not found then
      raise exception 'Wallet non trovato' using errcode = 'P0002';
    end if;

    update public.bookings
    set status = 'CANCELLED'
    where id = v_booking.id;

    update public.wallets
    set balance_credits = round((public.wallets.balance_credits + v_booking.total_credits)::numeric, 2)
    where id = v_wallet_id;

    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    values (v_wallet_id, 'BONUS', v_booking.total_credits, 0, null, coalesce(p_reason, 'Rimborso admin'));

    status := 'CANCELLED';
    refunded := true;
    refund_credits := v_booking.total_credits;
    return next;
  end if;

  if v_booking.status = 'CANCELLED' and p_status <> 'CANCELLED' then
    raise exception 'Transizione non valida' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = p_status
  where id = v_booking.id
  returning public.bookings.status into status;

  refunded := false;
  refund_credits := 0;
  return next;
end;
$$;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0007_station_layout_map.sql
-- --------------------------------------------------

alter table public.stations
add column if not exists layout_x integer,
add column if not exists layout_y integer,
add column if not exists layout_w integer,
add column if not exists layout_h integer,
add column if not exists layout_zone text;

with ranked as (
  select
    id,
    row_number() over (order by created_at asc, id asc) - 1 as idx
  from public.stations
)
update public.stations s
set
  layout_x = coalesce(s.layout_x, 6 + ((ranked.idx % 3) * 31)),
  layout_y = coalesce(s.layout_y, 10 + (((ranked.idx / 3)::integer) * 24)),
  layout_w = coalesce(s.layout_w, 24),
  layout_h = coalesce(s.layout_h, 16),
  layout_zone = coalesce(
    s.layout_zone,
    case s.type
      when 'WASH_BASIN' then 'Area Lavaggio'
      when 'DRYING_ZONE' then 'Area Asciugatura'
      when 'GROOMING_TABLE' then 'Area Toelettatura'
      else 'Area Servizio'
    end
  )
from ranked
where s.id = ranked.id;

alter table public.stations
alter column layout_x set default 6,
alter column layout_y set default 10,
alter column layout_w set default 24,
alter column layout_h set default 16,
alter column layout_zone set default 'Area Servizio';

update public.stations
set
  layout_x = coalesce(layout_x, 6),
  layout_y = coalesce(layout_y, 10),
  layout_w = coalesce(layout_w, 24),
  layout_h = coalesce(layout_h, 16),
  layout_zone = coalesce(layout_zone, 'Area Servizio');

alter table public.stations
alter column layout_x set not null,
alter column layout_y set not null,
alter column layout_w set not null,
alter column layout_h set not null,
alter column layout_zone set not null;

alter table public.stations
add constraint stations_layout_x_range check (layout_x >= 0 and layout_x <= 95),
add constraint stations_layout_y_range check (layout_y >= 0 and layout_y <= 95),
add constraint stations_layout_w_range check (layout_w >= 8 and layout_w <= 100),
add constraint stations_layout_h_range check (layout_h >= 8 and layout_h <= 100);



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0008_cancel_booking_refund_policy.sql
-- --------------------------------------------------

create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns table (
  cancelled boolean,
  refunded boolean,
  refund_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_booking public.bookings%rowtype;
  v_minutes_to_start numeric;
  v_refund_ratio numeric;
  v_refund_credits numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = v_user_id;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.status in ('CANCELLED', 'COMPLETED') then
    cancelled := false;
    refunded := false;
    refund_credits := 0;
    return next;
  end if;

  if v_booking.start_time <= now() then
    raise exception 'Prenotazione gia iniziata' using errcode = 'P0001';
  end if;

  select w.id into v_wallet_id
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  v_minutes_to_start := extract(epoch from (v_booking.start_time - now())) / 60.0;

  v_refund_ratio := case
    when v_minutes_to_start >= 1440 then 1.0
    when v_minutes_to_start >= 720 then 0.5
    when v_minutes_to_start >= 120 then 0.25
    else 0.0
  end;

  v_refund_credits := round((v_booking.total_credits * v_refund_ratio)::numeric, 2);

  update public.bookings
  set status = 'CANCELLED'
  where id = v_booking.id;

  cancelled := true;

  if v_refund_credits > 0 then
    update public.wallets
    set balance_credits = round((public.wallets.balance_credits + v_refund_credits)::numeric, 2)
    where id = v_wallet_id;

    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    values (
      v_wallet_id,
      'BONUS',
      v_refund_credits,
      0,
      null,
      'Rimborso cancellazione ' || round((v_refund_ratio * 100)::numeric, 0)::text || '%'
    );

    refunded := true;
    refund_credits := v_refund_credits;
    return next;
  end if;

  refunded := false;
  refund_credits := 0;
  return next;
end;
$$;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0009_update_cancel_policy_48h.sql
-- --------------------------------------------------

create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns table (
  cancelled boolean,
  refunded boolean,
  refund_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_wallet_id uuid;
  v_booking public.bookings%rowtype;
  v_minutes_to_start numeric;
  v_refund_ratio numeric;
  v_refund_credits numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = v_user_id;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.status in ('CANCELLED', 'COMPLETED') then
    cancelled := false;
    refunded := false;
    refund_credits := 0;
    return next;
  end if;

  if v_booking.start_time <= now() then
    raise exception 'Prenotazione gia iniziata' using errcode = 'P0001';
  end if;

  select w.id into v_wallet_id
  from public.wallets w
  where w.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet non trovato' using errcode = 'P0002';
  end if;

  v_minutes_to_start := extract(epoch from (v_booking.start_time - now())) / 60.0;

  v_refund_ratio := case
    when v_minutes_to_start >= 2880 then 1.0
    when v_minutes_to_start >= 1440 then 0.7
    when v_minutes_to_start >= 720 then 0.5
    when v_minutes_to_start >= 480 then 0.25
    else 0.0
  end;

  v_refund_credits := round((v_booking.total_credits * v_refund_ratio)::numeric, 2);

  update public.bookings
  set status = 'CANCELLED'
  where id = v_booking.id;

  cancelled := true;

  if v_refund_credits > 0 then
    update public.wallets
    set balance_credits = round((public.wallets.balance_credits + v_refund_credits)::numeric, 2)
    where id = v_wallet_id;

    insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
    values (
      v_wallet_id,
      'BONUS',
      v_refund_credits,
      0,
      null,
      'Rimborso cancellazione ' || round((v_refund_ratio * 100)::numeric, 0)::text || '%'
    );

    refunded := true;
    refund_credits := v_refund_credits;
    return next;
  end if;

  refunded := false;
  refund_credits := 0;
  return next;
end;
$$;




-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0010_coupons_and_extensions.sql
-- --------------------------------------------------

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



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0011_add_assisted_booking_option.sql
-- --------------------------------------------------

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



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0012_pet_profiles_and_gallery.sql
-- --------------------------------------------------

-- 1. Create pet_treatments table
create table if not exists public.pet_treatments (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  treatment_date timestamptz not null default now(),
  treatment_type text not null,
  products_used text null,
  groomer_notes text null,
  created_at timestamptz not null default now()
);

-- 2. Create pet_gallery table
create table if not exists public.pet_gallery (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  photo_url text not null,
  caption text null,
  created_at timestamptz not null default now()
);

-- 3. Enable RLS
alter table public.pet_treatments enable row level security;
alter table public.pet_gallery enable row level security;

-- 4. Policies for pet_treatments
create policy "Users can view their own pet treatments"
on public.pet_treatments for select
to authenticated
using (
  exists (
    select 1 from public.dogs d
    where d.id = pet_treatments.dog_id and d.owner_id = auth.uid()
  )
);

create policy "Admins can do everything on pet_treatments"
on public.pet_treatments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 5. Policies for pet_gallery
create policy "Users can view their own pet gallery"
on public.pet_gallery for select
to authenticated
using (
  exists (
    select 1 from public.dogs d
    where d.id = pet_gallery.dog_id and d.owner_id = auth.uid()
  )
);

create policy "Admins can do everything on pet_gallery"
on public.pet_gallery for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 6. Indexes
create index if not exists pet_treatments_dog_id_idx on public.pet_treatments (dog_id);
create index if not exists pet_gallery_dog_id_idx on public.pet_gallery (dog_id);



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0013_system_settings.sql
-- --------------------------------------------------

-- 1. Create enum for operating mode
create type public.operating_mode as enum ('SELF_ONLY', 'ASSISTED_ONLY', 'HYBRID');

-- 2. Create system_settings table
create table if not exists public.system_settings (
  id integer primary key default 1 check (id = 1), -- Only one row allowed
  mode public.operating_mode not null default 'HYBRID',
  max_concurrent_assisted integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 3. Insert default row
insert into public.system_settings (id, mode, max_concurrent_assisted) 
values (1, 'HYBRID', 1)
on conflict (id) do nothing;

-- 4. Enable RLS
alter table public.system_settings enable row level security;

-- 5. Policies
create policy "Anyone can read system_settings"
on public.system_settings for select
to public
using (true);

create policy "Admins can update system_settings"
on public.system_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 6. Trigger for updated_at (optional, but good practice)
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger system_settings_updated_at
before update on public.system_settings
for each row
execute function public.handle_updated_at();



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0014_services_and_pricing.sql
-- --------------------------------------------------

-- 1. Create the new enum for service types
create type public.booking_service_type as enum ('SELF_SERVICE', 'ASSISTED_WASH', 'FULL_GROOMING');

-- 2. Add new columns to system_settings
alter table public.system_settings 
  add column if not exists enable_assisted_wash boolean not null default true,
  add column if not exists price_assisted_wash_credits integer not null default 10,
  add column if not exists enable_full_grooming boolean not null default true,
  add column if not exists price_full_grooming_credits integer not null default 50;

-- 3. Modify the bookings table
alter table public.bookings 
  add column if not exists service_type public.booking_service_type not null default 'SELF_SERVICE',
  add column if not exists operator_cost_credits integer not null default 0;

-- 4. Migrate data from old boolean column to new enum
update public.bookings 
set service_type = 'ASSISTED_WASH' 
where assisted = true;

-- 5. Drop the old boolean column
alter table public.bookings drop column if exists assisted;




-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0015_update_create_booking_rpc.sql
-- --------------------------------------------------

-- Migrazione 0015: Aggiorna create_booking per usare service_type e prezzi da system_settings.

create or replace function public.create_booking(
  p_station_id uuid,
  p_dog_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_service_type public.booking_service_type default 'SELF_SERVICE'
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
  v_station_cost numeric;
  v_operator_cost numeric := 0;
  v_total_credits numeric;
  v_station_status public.station_status;
  v_created_booking_id uuid;
  v_created_status public.booking_status;
  
  -- system settings
  v_enable_assisted boolean;
  v_price_assisted integer;
  v_enable_full boolean;
  v_price_full integer;
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

  -- Read system settings
  select enable_assisted_wash, price_assisted_wash_credits, enable_full_grooming, price_full_grooming_credits
    into v_enable_assisted, v_price_assisted, v_enable_full, v_price_full
  from public.system_settings
  where id = 1;

  -- Validate service type and compute operator cost
  if p_service_type = 'ASSISTED_WASH' then
    if not v_enable_assisted then
       raise exception 'Servizio Lavaggio Assistito non disponibile' using errcode = 'P0001';
    end if;
    v_operator_cost := v_price_assisted;
  elsif p_service_type = 'FULL_GROOMING' then
    if not v_enable_full then
       raise exception 'Servizio Toelettatura Completa non disponibile' using errcode = 'P0001';
    end if;
    v_operator_cost := v_price_full;
  end if;

  v_minutes := greatest(1, ceil(extract(epoch from (p_end_time - p_start_time)) / 60.0)::int);
  v_station_cost := round((v_cost_per_minute * v_minutes)::numeric, 2);
  v_total_credits := v_station_cost + v_operator_cost;

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

  insert into public.bookings (customer_id, dog_id, station_id, start_time, end_time, status, total_credits, service_type, operator_cost_credits)
  values (v_user_id, p_dog_id, p_station_id, p_start_time, p_end_time, 'CONFIRMED', v_total_credits, p_service_type, v_operator_cost)
  returning public.bookings.id, public.bookings.status
  into v_created_booking_id, v_created_status;

  booking_id := v_created_booking_id;
  total_credits := v_total_credits;
  status := v_created_status;

  insert into public.token_transactions (wallet_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  values (
    v_wallet_id, 
    'DEBIT', 
    v_total_credits, 
    0, 
    null, 
    case 
      when p_service_type = 'ASSISTED_WASH' then 'Prenotazione Lavaggio Assistito' 
      when p_service_type = 'FULL_GROOMING' then 'Prenotazione Toelettatura Completa'
      else 'Prenotazione self-service' 
    end
  );

  return next;
end;
$$;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0016_atomic_wallet_topup.sql
-- --------------------------------------------------

-- Funzione atomica per l'accredito wallet
-- Previene race condition usando UPDATE ... SET balance = balance + N
-- invece di leggere il saldo, sommare in applicazione e riscrivere.

CREATE OR REPLACE FUNCTION atomic_wallet_topup(
  p_wallet_id uuid,
  p_credits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.wallets
  SET balance_credits = balance_credits + p_credits,
      updated_at = now()
  WHERE id = p_wallet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet non trovato: %', p_wallet_id;
  END IF;
END;
$$;

-- Permessi: solo il service_role può invocare questa funzione
REVOKE ALL ON FUNCTION atomic_wallet_topup(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION atomic_wallet_topup(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION atomic_wallet_topup(uuid, integer) FROM authenticated;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0018_fix_availability_rls_bypass.sql
-- --------------------------------------------------

-- ============================================================
-- 0018: Fix get_booking_availability — bypassa RLS per vedere
--       le prenotazioni di TUTTI gli utenti (non solo le proprie)
-- ============================================================
-- PROBLEMA: la funzione precedente girava con RLS attiva, quindi
-- restituiva solo le prenotazioni dell'utente corrente. Questo
-- permetteva a Utente B di prenotare slot già occupati da Utente A
-- (overbooking).
--
-- SOLUZIONE: aggiunta di LANGUAGE plpgsql + SET LOCAL row_security = OFF
-- dentro SECURITY DEFINER. Il SET LOCAL è sicuro: viene ripristinato
-- automaticamente al termine della funzione. Non espone dati privati
-- perché restituiamo solo station_id, start_time, end_time.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_booking_availability(
  p_from timestamptz,
  p_to   timestamptz
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
  -- Bypassa RLS: necessario per vedere le prenotazioni di TUTTI gli utenti,
  -- non solo quelle dell'utente corrente. Sicuro: la funzione espone
  -- solo station_id e range orario, nessun dato personale.
  SET LOCAL row_security = OFF;

  RETURN QUERY
    SELECT b.station_id, b.start_time, b.end_time
    FROM public.bookings b
    WHERE b.status IN ('PENDING', 'CONFIRMED')
      AND b.start_time < p_to
      AND b.end_time   > p_from;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_availability(timestamptz, timestamptz)
  TO anon, authenticated;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0019_fix_create_booking_overlap_check.sql
-- --------------------------------------------------

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



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 0020_fix_create_booking_column_ambiguity.sql
-- --------------------------------------------------

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



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260618113223_admin_audit_logs.sql
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
    ON public.admin_audit_logs
    FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can insert audit logs"
    ON public.admin_audit_logs
    FOR INSERT
    WITH CHECK (public.is_admin());



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260625203300_multi_tenancy.sql
-- --------------------------------------------------

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





-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260626125000_tenants_public_read_rls.sql
-- --------------------------------------------------

-- Migrazione: RLS per la tabella tenants
-- Consente l'accesso pubblico in lettura alla tabella tenants in modo che il middleware (anonimo) possa verificare lo stato della scadenza.
-- Consente la scrittura (ALL) solo ai superadmin.

-- 1. Abilita la RLS sulla tabella tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Criterio per consentire la lettura pubblica a chiunque
DROP POLICY IF EXISTS "Allow public read access to tenants" ON public.tenants;
CREATE POLICY "Allow public read access to tenants" ON public.tenants
  FOR SELECT TO public USING (true);

-- 3. Criterio per consentire tutte le operazioni (scrittura/modifica) solo ai superadmin
DROP POLICY IF EXISTS "Allow superadmin write access to tenants" ON public.tenants;
CREATE POLICY "Allow superadmin write access to tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin', false))
  WITH CHECK (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin', false));



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260626130000_multisalone_shared_accounts.sql
-- --------------------------------------------------

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



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260627000000_dynamic_services.sql
-- --------------------------------------------------

-- Migration: 20260627000000_dynamic_services.sql
-- Description: Create dynamic services catalog, link bookings, migrate data.

-- 1. Create services table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  station_type public.station_type NOT NULL,
  booking_type public.booking_service_type NOT NULL DEFAULT 'SELF_SERVICE',
  fixed_cost_credits NUMERIC NOT NULL DEFAULT 0,
  cost_per_minute_credits NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
DROP POLICY IF EXISTS "services_select_all" ON public.services;
CREATE POLICY "services_select_all" ON public.services FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "services_admin_write" ON public.services;
CREATE POLICY "services_admin_write" ON public.services FOR ALL TO authenticated
  USING (public.is_admin() AND tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_admin() AND tenant_id = public.current_tenant_id());

-- 4. Add service_id column to bookings (must be nullable at first to insert old records/link)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT;

-- 5. Seed default services for all existing tenants and migrate existing bookings
DO $$
DECLARE
  v_tenant RECORD;
  v_self_id UUID;
  v_assisted_id UUID;
  v_full_id UUID;
  v_price_assisted NUMERIC;
  v_price_full NUMERIC;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    -- Try to read custom prices from system_settings, fallback if not found
    SELECT price_assisted_wash_credits, price_full_grooming_credits
      INTO v_price_assisted, v_price_full
    FROM public.system_settings
    WHERE tenant_id = v_tenant.id
    LIMIT 1;

    IF v_price_assisted IS NULL THEN v_price_assisted := 10; END IF;
    IF v_price_full IS NULL THEN v_price_full := 20; END IF;

    -- A. Self-Service (WASH_BASIN, SELF_SERVICE, fixed_cost=0)
    INSERT INTO public.services (tenant_id, name, description, station_type, booking_type, fixed_cost_credits, cost_per_minute_credits, is_active)
    VALUES (v_tenant.id, 'Self-Service', 'Lavaggio e asciugatura in autonomia', 'WASH_BASIN', 'SELF_SERVICE', 0, 0, true)
    RETURNING id INTO v_self_id;

    -- B. Lavaggio Assistito (WASH_BASIN, ASSISTED_WASH, fixed_cost=v_price_assisted)
    INSERT INTO public.services (tenant_id, name, description, station_type, booking_type, fixed_cost_credits, cost_per_minute_credits, is_active)
    VALUES (v_tenant.id, 'Lavaggio Assistito', 'Lavaggio con supporto dell''operatore', 'WASH_BASIN', 'ASSISTED_WASH', v_price_assisted, 0, true)
    RETURNING id INTO v_assisted_id;

    -- C. Toelettatura Completa (GROOMING_TABLE, FULL_GROOMING, fixed_cost=v_price_full)
    INSERT INTO public.services (tenant_id, name, description, station_type, booking_type, fixed_cost_credits, cost_per_minute_credits, is_active)
    VALUES (v_tenant.id, 'Toelettatura Completa', 'Servizio completo di tosatura e rifinitura', 'GROOMING_TABLE', 'FULL_GROOMING', v_price_full, 0, true)
    RETURNING id INTO v_full_id;

    -- Update existing bookings to link to these services
    UPDATE public.bookings
    SET service_id = v_self_id
    WHERE tenant_id = v_tenant.id AND service_type = 'SELF_SERVICE';

    UPDATE public.bookings
    SET service_id = v_assisted_id
    WHERE tenant_id = v_tenant.id AND service_type = 'ASSISTED_WASH';

    UPDATE public.bookings
    SET service_id = v_full_id
    WHERE tenant_id = v_tenant.id AND service_type = 'FULL_GROOMING';
  END LOOP;
END;
$$;

-- 6. Enforce NOT NULL constraint on service_id for future bookings
-- If there are any stray bookings (like demo ones with no tenant or default tenant), we assign them to the default tenant's self-service
DO $$
DECLARE
  v_default_self_id UUID;
BEGIN
  SELECT id INTO v_default_self_id 
  FROM public.services 
  WHERE name = 'Self-Service'
  LIMIT 1;

  IF v_default_self_id IS NOT NULL THEN
    UPDATE public.bookings SET service_id = v_default_self_id WHERE service_id IS NULL;
  END IF;
END;
$$;

ALTER TABLE public.bookings ALTER COLUMN service_id SET NOT NULL;



-- --------------------------------------------------
-- INIZIO MIGRAZIONE: 20260627135800_fix_wallet_ambiguity.sql
-- --------------------------------------------------

-- Fix per l'ambiguità sulla colonna balance_credits in admin_adjust_wallet
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

  v_balance := round((v_balance + p_amount_credits)::numeric, 2);

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Saldo insufficiente per lo storno' USING errcode = 'P0001';
  END IF;

  UPDATE public.wallets
  SET balance_credits = v_balance
  WHERE id = v_wallet_id;

  INSERT INTO public.token_transactions (wallet_id, tenant_id, type, amount_credits, amount_currency, stripe_intent_id, note)
  VALUES (v_wallet_id, v_tenant_id, v_type, v_abs, 0, null, p_reason);

  balance_credits := v_balance;
  RETURN NEXT;
END;
$$;

-- Fix per l'ambiguità sulla colonna balance_credits in apply_wallet_topup
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

  v_balance := round((v_balance + p_amount_credits)::numeric, 2);

  UPDATE public.wallets
  SET balance_credits = v_balance
  WHERE id = v_wallet_id;

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


