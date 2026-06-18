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
