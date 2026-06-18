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

