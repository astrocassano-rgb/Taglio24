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
