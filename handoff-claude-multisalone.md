# Handoff per Antigravity — Correzioni multisalone (claude.ai)

> Documento di passaggio di consegne. Scritto da **claude.ai** (Claude Code) per coordinarsi
> con Antigravity (Gemini) ed evitare conflitti/sovrascritture sugli stessi file.
> Data: 2026-06-26. Build verificato: `npm run build` ✅ verde.

## ⚠️ Prima di tutto: lo stato del repo
L'intera feature multisalone (Opzione A) è **non committata** nel working tree. Quando ho
iniziato erano già presenti modifiche non committate di Antigravity. Per non perdere lavoro:

1. **Fai un commit** (o uno stash) di QUESTO stato prima di continuare a sviluppare.
2. Riparti da questa versione: contiene il mio audit + le correzioni elencate sotto.

## ✅ File che HO modificato io (claude.ai) — riparti da questi
| File | Cosa ho fatto |
|------|---------------|
| `middleware.ts` | Rimosso il blocco `/salone-errato` che leggeva `profiles.tenant_id` (colonna eliminata). Un cliente loggato torna alla home. |
| `supabase/migrations/20260626130000_multisalone_shared_accounts.sql` | Fix sicurezza/correttezza (vedi sotto) + nuova funzione condivisa `provision_tenant_welcome` + avviso pre-flight. |
| `supabase/migrations/20260626130000_multisalone_shared_accounts.down.sql` | **NUOVO** — rollback best-effort documentato. |
| `src/app/auth/callback/route.ts` | Sostituito il doppio `upsert` manuale con `rpc("provision_tenant_welcome")` (idempotente, con ledger, niente azzeramento saldo). |
| `src/lib/tenant.ts` | Annotato il tipo di ritorno di `getTenantFromHost()` (era inferito `never`, rompeva il build). |
| `src/types/database.ts` | Aggiunto il tipo della tabella `tenant_customers` (mancava). |
| `src/lib/auth/require-admin.ts` | Cast `as any` su `getTenantFromHost()` e sulla query `tenant_customers` (allineato al pattern del resto del codice). |
| `README.md` | Sezione "Multi-tenancy & Account condiviso multisalone" con audit e fix. |

## 🚫 File che NON ho toccato (sono tuoi, lavoro non committato)
Per evitare malintesi: queste modifiche nel `git status` **non sono mie**.
- `src/app/(app)/layout.tsx`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`
- `src/app/api/wallet/stripe-checkout/route.ts`, `src/app/api/wallet/stripe-webhook/route.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/superadmin/tenants/[tenantId]/admin-actions.ts` (l'avevo toccato ma ho **ripristinato** l'originale: net zero)
- gli script `scripts/*.mjs` di test (`create-test-user`, `list-users`, `complete-test-profile`, `apply-shared-accounts-migration`)
- `public/sw.js` (rigenerato automaticamente dal build)

## 🔒 Correzioni di sicurezza/correttezza applicate (sintesi)
1. Backfill migrazione: `WHERE tenant_id IS NOT NULL` (evita abort se un profilo ha tenant NULL).
2. `current_tenant_id()`: rimosso il fallback su `user_metadata` (falsificabile) → fail-closed (`NULL`).
3. Policy `coupons`: lettura legata all'appartenenza reale (`tenant_customers`), non al solo header.
4. `init_tenant_customer_if_needed`: auto-join **senza** bonus + validazione tenant (anti-farming).
5. `handle_new_user`: ora delega a `provision_tenant_welcome` (bonus una-tantum + ledger).
6. Policy `tenant_customers`: lettura admin del proprio salone; **scrittura solo superadmin**.
7. Funzione condivisa `provision_tenant_welcome`: `REVOKE` da `authenticated`/`anon`, `GRANT` a `service_role`.

## 📌 Regole di lavoro condivise (da rispettare d'ora in poi)
- **Migrazioni e nuove tabelle**: NON crearle in autonomia se non strettamente indispensabili.
  È l'utente (umano) che applica/crea migrazioni e tabelle. Se una nuova tabella/migrazione è
  davvero necessaria, **proporla e spiegarne il motivo**, poi lasciare che la applichi l'utente.
- Mantenere i due provisioning distinti:
  - `init_tenant_customer_if_needed` → auto-join **senza bonus** (chiamabile dagli utenti);
  - `provision_tenant_welcome` → bonus benvenuto, **solo service-role / trigger**.
- Tenant context: fidarsi di `x-tenant-id` solo se impostato dal server (host); le RLS devono
  restare ancorate a `auth.uid()` / `is_admin()`.

## 🧩 Da fare (lato umano / deploy)
1. Applicare la migrazione **dopo backup** (`scripts/apply-supabase-sql.mjs` o `supabase db push`).
2. **Rigenerare i tipi** Supabase (`supabase gen types typescript`) → poi rimuovere i cast `as any` su `tenant_customers`.
3. Impostare `VERCEL_TEAM_ID` se il progetto è in un team Vercel.
4. Deploy + test sui sottodomini reali.
