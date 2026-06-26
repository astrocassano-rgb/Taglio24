-- ROLLBACK best-effort della migrazione 20260626130000_multisalone_shared_accounts (nota #7, claude.ai)
--
-- ============================================================================================
-- ⚠️ LEGGERE PRIMA DI ESEGUIRE
-- ============================================================================================
-- Questo script tenta di riportare lo schema allo stato PRE-multisalone, ma NON è un rollback
-- perfetto: la migrazione "up" è distruttiva e alcune informazioni non sono ricostruibili.
--
-- Limitazioni note (NON aggirabili da SQL):
--   1) profiles.tenant_id era 1:1; ora un utente può appartenere a PIÙ saloni (tenant_customers).
--      Nel ripristino possiamo assegnare a profiles.tenant_id UN SOLO tenant per utente:
--      qui scegliamo il salone dove l'utente è 'admin', altrimenti il più recente. È una SCELTA
--      arbitraria: le altre appartenenze andrebbero perse.
--   2) wallets ora ha più righe per utente (una per salone). Ripristinare UNIQUE(customer_id)
--      FALLIREBBE se un utente ha wallet in più saloni. Lo script NON ripristina quel vincolo
--      in automatico proprio per non corrompere/perdere saldi: va gestito manualmente.
--   3) Le funzioni/policy precedenti (is_admin, current_tenant_id, handle_new_user, ecc.) NON
--      vengono ripristinate alle versioni legacy: dipendono dalle migrazioni precedenti.
--
-- 👉 In presenza di dati di produzione, il metodo CORRETTO di rollback è il RESTORE da BACKUP,
--    non questo script. Usare questo file solo su ambienti di sviluppo/staging o per riferimento.
-- ============================================================================================

BEGIN;

-- 1. Ripristina la colonna profiles.tenant_id (nullable, senza vincoli stretti)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2. Backfill best-effort: un solo tenant per utente.
--    Preferenza: il salone in cui l'utente è 'admin'; in mancanza, l'appartenenza più recente.
UPDATE public.profiles p
SET tenant_id = sub.tenant_id
FROM (
  SELECT DISTINCT ON (customer_id)
         customer_id,
         tenant_id
  FROM public.tenant_customers
  -- 'admin' prima di 'customer'; a parità, l'iscrizione più recente
  ORDER BY customer_id,
           (role = 'admin') DESC,
           created_at DESC
) AS sub
WHERE p.id = sub.customer_id;

-- 3. Rimuove la vista e la tabella junction introdotte dalla "up".
DROP VIEW IF EXISTS public.admin_customers_overview;
DROP TABLE IF EXISTS public.tenant_customers;

-- 4. Vincolo wallets: NON ripristiniamo automaticamente UNIQUE(customer_id).
--    Sbloccare manualmente SOLO dopo aver verificato/consolidato i wallet duplicati per utente:
--      ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_customer_tenant_uq;
--      ALTER TABLE public.wallets ADD  CONSTRAINT wallets_customer_id_key UNIQUE (customer_id);
--    (Eseguibile solo se nessun customer_id ha più di un wallet.)

-- 5. Le policy/funzioni legacy NON sono ricreate qui: rieseguire le migrazioni precedenti
--    (in particolare 20260625203300_multi_tenancy.sql) se serve ripristinarne le versioni.

COMMIT;
