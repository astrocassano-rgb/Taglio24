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
