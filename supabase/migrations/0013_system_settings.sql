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
