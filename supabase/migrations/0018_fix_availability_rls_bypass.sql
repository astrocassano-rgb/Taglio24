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
