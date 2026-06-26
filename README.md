# DogWash24 / Toilettatura SaaS

Webapp SaaS per la gestione di una toilettatura self-service per cani.

L'app permette di:

- mostrare una landing page pubblica chiara
- autenticare davvero i clienti
- gestire i profili dei cani
- usare un wallet a crediti
- vedere disponibilita reali delle postazioni
- prenotare una sessione guidata con conferma reale su database
- consultare le prenotazioni dalla dashboard
- esportare gli appuntamenti su Google Calendar o tramite file `.ics`

Questo README descrive lo stato attuale del progetto, sia dal punto di vista prodotto sia dal punto di vista tecnico.

## Obiettivo del prodotto

L'obiettivo e offrire un'esperienza molto semplice, mobile-first e guidata, pensata per clienti finali che vogliono:

- registrarsi in pochi passaggi
- salvare uno o piu cani
- capire subito che servizi sono disponibili
- scegliere giorno e orario senza confusione
- pagare usando crediti
- ritrovare dopo la prenotazione un riepilogo chiaro nella propria area personale

Il progetto e stato progettato per separare:

- esperienza pubblica: landing, disponibilita e guida alla prenotazione
- esperienza autenticata: dashboard, cani, wallet, prenotazioni, privacy

## Stato attuale

Funzionalita oggi implementate:

- landing pubblica con branding e spiegazione del flusso
- login e registrazione reali con Supabase Auth
- recupero password completo (`/reset-password`)
- OAuth (Supabase) per accesso con Google (Apple predisposto lato UI, da abilitare/configurare in Supabase)
- completamento profilo obbligatorio post-login/post-signup (nome, cognome, telefono)
- redirect intelligente verso la destinazione richiesta dopo login
- dashboard privata con saldo wallet e prossime prenotazioni
- gestione cani collegata al database
- wallet con saldo e navigazione ai movimenti/ricarica
- pagina pubblica `/prenota` con wizard semplificato
- pagina autenticata `/prenota/nuova` con wizard guidato completo
- vista avanzata alternativa “calendario a colonne” per prenotazioni rapide
- selezione di piu servizi nella stessa esperienza utente
- durata suggerita in base a servizi, taglia e peso del cane
- selezione giorno con campi `GG/MM/AAAA` oppure calendario in card
- selezione orario con “ruota” (time wheel) sugli slot realmente disponibili
- creazione reale della prenotazione via RPC Supabase
- export su Google Calendar
- export `.ics` per calendari compatibili con iCalendar
- dettaglio prenotazione in dashboard
- endpoint privacy per export dati e cancellazione account
- hardening lato privacy e sicurezza sulle operazioni sensibili
- deploy in produzione su Vercel (env vars e build Next gestite da Vercel)

Ultimi avanzamenti rilevanti:

- flusso reset password completo e robusto (gestione `code` e token hash + messaggi PKCE)
- OAuth Google via Supabase con redirect/callback compatibili con Vercel
- fix robustezza env Supabase in produzione (normalizzazione/trim valori env)
- gating “profilo obbligatorio” dopo autenticazione
- refactor UX prenotazione: data (GG/MM/AAAA o calendario) + selezione orario a ruota

## Multi-tenancy & Account condiviso multisalone (2026-06-26)

> Sezione curata da **claude.ai** (Claude Code). Documenta l'analisi di sicurezza e le correzioni applicate al modello multisalone (Opzione A) e all'automazione dei sottodomini.

### Contesto

Ogni negozio (tenant) è raggiungibile su un sottodominio di terzo livello:
`https://<slug>.app.dogwash24.it/`. Il sito vetrina resta su Aruba al dominio
principale `dogwash24.it`; la web app risiede su Vercel.

#### Decisione DNS/SSL (importante)

- Il wildcard SSL `*.app.dogwash24.it` richiederebbe la delega DNS a Vercel
  (record `NS`), ma **il pannello DNS di Aruba non accetta due record NS sullo
  stesso host**, quindi la delega del sottodominio non è praticabile.
- Soluzione adottata: su Aruba un CNAME wildcard `*.app → <target Vercel>` per il
  **routing** di tutti i sottodomini; su Vercel ogni negozio viene aggiunto come
  **dominio singolo** (SSL automatico via HTTP-01, senza wildcard cert).
- L'aggiunta del dominio è **automatizzata** via API Vercel in `src/lib/vercel.ts`
  (`addTenantDomain` / `getTenantDomainStatus` / `removeTenantDomain`), invocata
  alla creazione del tenant in `src/app/superadmin/tenants/new/actions.ts`.
  Env richieste: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `TENANT_ROOT_DOMAIN`
  (e `VERCEL_TEAM_ID` se il progetto è dentro un team Vercel).

### Modello dati (Opzione A — account condiviso)

- Identità globale: un utente Supabase usa le stesse credenziali su tutti i saloni.
- `profiles` diventa globale (rimossa la colonna `tenant_id`).
- Nuova tabella junction `tenant_customers (customer_id, tenant_id, role)` per
  l'appartenenza e il ruolo (`customer` / `admin`) per singolo salone.
- `wallets`: vincolo unico passato da `UNIQUE(customer_id)` a
  `UNIQUE(customer_id, tenant_id)` → portafoglio separato per salone.
- Rilevamento tenant: header `x-tenant-id` impostato dal server (da host) e letto
  in Postgres da `current_tenant_id()`.

Migrazione: `supabase/migrations/20260626130000_multisalone_shared_accounts.sql`.

### Audit di sicurezza e correzioni applicate da claude.ai

Esito audit: l'isolamento RLS è ben ancorato a `auth.uid()` e `is_admin()`
riverifica l'appartenenza reale in `tenant_customers` → **niente escalation admin
né leak cross-utente** via spoofing dell'header. Il percorso pagamenti Stripe
(checkout + webhook) attribuisce correttamente il `tenant_id`.

Correzioni applicate:

1. **`middleware.ts`** — rimosso il blocco `/salone-errato` che leggeva
   `profiles.tenant_id` (colonna eliminata dalla migrazione): un cliente loggato
   torna alla home, coerente con l'account condiviso.
2. **Migrazione dati** — aggiunto `WHERE tenant_id IS NOT NULL` al backfill di
   `tenant_customers` (un profilo con tenant NULL avrebbe fatto abortire la migrazione).
3. **`current_tenant_id()`** — rimosso il fallback su `user_metadata` (modificabile
   dall'utente → spoofing del tenant): senza header affidabile ritorna `NULL`
   (fail-closed).
4. **Policy `coupons`** — la lettura ora richiede l'appartenenza reale al salone
   (`tenant_customers`), non più il solo header falsificabile.
5. **`init_tenant_customer_if_needed`** — rimosso il bonus automatico (auto-join a
   saldo 0) + validazione esistenza tenant → stop al farming del bonus benvenuto.
6. **`handle_new_user`** — bonus benvenuto una-tantum solo al signup reale
   (`ON CONFLICT DO NOTHING`, niente doppio accredito) + guardia FK sul tenant.
7. **Tipi/build** — aggiunto il tipo `tenant_customers` in `src/types/database.ts`,
   annotato il ritorno di `getTenantFromHost()` in `src/lib/tenant.ts` (era inferito
   come `never`), allineati i cast su `require-admin.ts` / `admin-actions.ts`.
   `npm run build` verde.
8. **Policy `tenant_customers`** — sostituita la vecchia policy `FOR ALL` basata su
   `raw_app_meta_data` con: lettura per gli admin del proprio salone
   (`is_admin() AND tenant_id = current_tenant_id()`) e **scrittura riservata al solo
   superadmin**. Le scritture legittime passano comunque da service-role / funzioni
   `SECURITY DEFINER`, quindi nessun flusso si rompe.
9. **Sicurezza migrazione** — aggiunto avviso pre-flight (backup + staging) in testa
   alla migrazione e creato lo script di rollback best-effort documentato
   `20260626130000_multisalone_shared_accounts.down.sql`.
10. **Bonus di benvenuto unificato** — introdotta la funzione SQL condivisa
    `provision_tenant_welcome(p_user_id, p_tenant_id, p_welcome_credits)`, usata sia
    dal trigger `handle_new_user` (signup email) sia dal callback OAuth
    (`src/app/auth/callback/route.ts`). Garantisce bonus **identico, una-tantum e
    sempre registrato nel ledger**; eseguibile solo via service-role (`REVOKE` da
    `authenticated`/`anon`, `GRANT` a `service_role`). Risolto anche il bug del callback
    che con un `upsert` azzerava il saldo wallet a 2 per i portafogli già esistenti.

> Differenza tra le due funzioni di provisioning: `init_tenant_customer_if_needed`
> crea l'appartenenza **senza** bonus (auto-join alla visita di un salone, chiamabile
> dagli utenti); `provision_tenant_welcome` concede il bonus di benvenuto ed è
> riservata ai contesti fidati.

### Punti residui (da valutare con il team)

- Dopo l'applicazione della migrazione, **rigenerare i tipi Supabase**
  (`supabase gen types typescript`) per rimuovere i cast `as any` su `tenant_customers`.
- La pagina `superadmin/tenants/[tenantId]` filtra ancora gli utenti del salone via
  `user_metadata.tenant_id` (modello legacy): valutare il passaggio a `tenant_customers`.
- Valutare la migrazione a due fasi (drop di `profiles.tenant_id` in una seconda
  migrazione separata) per ridurre il rischio in produzione.

## Stack tecnico

- Next.js 15 con App Router
- React 19
- TypeScript strict
- Tailwind CSS
- Supabase
  - Auth
  - Postgres
  - Row Level Security
  - RPC SQL
  - Realtime
- `@supabase/ssr`
- `@supabase/supabase-js`
- `lucide-react`
- `zustand`

## Architettura generale

L'app segue una struttura semplice:

- frontend web in Next.js
- autenticazione, database e realtime in Supabase
- logica di business critica spostata su funzioni RPC SQL
- protezione delle aree private gestita da middleware

### Principio chiave

Le operazioni delicate sulle prenotazioni non vengono lasciate al frontend.

La creazione prenotazione passa da:

- controlli autenticazione
- verifica proprieta del cane
- verifica disponibilita
- verifica wallet
- addebito crediti
- inserimento prenotazione
- registrazione movimento wallet

Questo avviene nella funzione SQL `create_booking`.

## Esperienza utente

### 1. Utente non loggato

L'utente arriva sulla home pubblica e puo:

- capire cos'e l'app
- andare a login/registrazione
- vedere la disponibilita da `/prenota`

La pagina pubblica `/prenota` non crea da sola la prenotazione finale, ma:

- fa scegliere i servizi
- mostra una stima iniziale del tempo
- mostra i giorni disponibili
- fa scegliere un orario
- porta l'utente autenticato al wizard finale

### 2. Utente loggato

Una volta autenticato, l'utente entra nella dashboard e puo:

- vedere il saldo crediti
- aprire il wallet
- gestire i cani
- prenotare
- vedere i prossimi appuntamenti
- aprire il dettaglio di una prenotazione
- aggiungere l'appuntamento al calendario

### 3. Prenotazione guidata autenticata

Il wizard autenticato `/prenota/nuova` e pensato come un flusso a step:

1. scelta cane
2. scelta servizi
3. durata suggerita
4. giorno e orario
5. conferma finale

Elementi importanti:

- supporta bundle di servizi, ad esempio `Lavaggio + Asciugatura`
- usa una durata suggerita basata sul cane
- mostra orari disponibili reali
- chiude la prenotazione tramite RPC `create_booking`

## Funzionalita principali nel codice

### Dashboard

La dashboard vive principalmente in:

- `src/app/(app)/home-client.tsx`

Qui vengono caricati:

- sessione utente
- saldo wallet
- prossime prenotazioni
- nomi dei cani
- nomi delle postazioni

Ogni prenotazione futura espone azioni rapide:

- dettaglio prenotazione
- Google Calendar
- download `.ics`

### Wizard pubblico

File principale:

- `src/app/(app)/prenota/page.tsx`

Responsabilita:

- esperienza pubblica guidata
- scelta servizi
- scelta giorno con GG/MM/AAAA oppure calendario in card
- scelta orario con ruota sugli slot liberi
- ponte verso login o wizard autenticato

### Wizard autenticato

File principale:

- `src/app/(app)/prenota/nuova/booking-wizard-client.tsx`

Responsabilita:

- caricamento cani
- caricamento postazioni
- caricamento disponibilita
- stima durata
- selezione giorno e orario (data + ruota orari)
- conferma prenotazione

### Pianificazione servizi e durata

Logica centralizzata in:

- `src/lib/booking-planner.ts`

Contiene:

- etichette servizi
- ordine servizi
- parsing/serializzazione bundle
- servizio principale
- riepilogo servizi
- stima durata in base a taglia e peso
- generazione link Google Calendar

### Middleware auth

File:

- `middleware.ts`

Protegge le route private:

- `/prenota/nuova`
- `/cani`
- `/wallet`
- `/profilo`
- `/prenotazioni`

Gestisce anche il redirect automatico fuori da `/login` se l'utente e gia autenticato.

### Calendario

Integrazioni attuali:

- link diretto a Google Calendar
- export `.ics` da route server

Route:

- `src/app/api/bookings/[bookingId]/calendar/route.ts`

Il file `.ics` e utile per:

- Apple Calendar
- Outlook
- calendari enterprise
- backup/import manuale di un evento

### Privacy

Route server:

- `GET /api/account/export`
- `POST /api/account/delete`

Documentazione dedicata:

- `PRIVACY-SECURITY.md`

## Struttura cartelle

Panoramica semplificata:

```text
src/
  app/
    (app)/
      cani/
      prenota/
      prenotazioni/
      profilo/
      wallet/
      home-client.tsx
    (auth)/
      login/
    api/
      account/
      bookings/
  components/
    dev/
    layout/
    ui/
  lib/
    supabase/
    booking-planner.ts
  store/
  types/
supabase/
  migrations/
scripts/
middleware.ts
PRIVACY-SECURITY.md
```

## Database e modelli principali

Dal codice e dalle migration emerge questo nucleo dati:

- `profiles`: profilo cliente
- `dogs`: profili cane
- `stations`: postazioni disponibili
- `bookings`: prenotazioni
- `wallets`: saldo crediti
- `token_transactions`: movimenti del wallet
- `active_sessions`: supporto sessioni attive postazione

Funzioni RPC principali:

- `create_booking`
- `cancel_booking`
- `get_booking_availability`

## Sicurezza e privacy

Garanzie tecniche gia presenti:

- autenticazione con Supabase Auth
- RLS sulle tabelle principali
- isolamento per utente via `auth.uid()`
- prenotazioni sensibili gestite via RPC
- export dati utente
- cancellazione account
- blocco delle scritture dirette non desiderate su `bookings`

Nota importante:

La conformita legale completa non dipende solo dal codice. Servono anche:

- privacy policy corretta
- termini d'uso
- processi operativi
- gestione consensi dove necessaria

## Route principali

### Pubbliche

- `/`
- `/login`
- `/prenota`

### Protette

- `/prenota/nuova`
- `/prenotazioni/[bookingId]`
- `/cani`
- `/wallet`
- `/profilo`

### API

- `/api/account/export`
- `/api/account/delete`
- `/api/bookings/[bookingId]/calendar`

## Setup locale

### Requisiti

- Node.js recente
- progetto Supabase attivo
- file `.env.local` configurato

### Installazione

```bash
npm install
```

### Variabili ambiente

Parti da `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

Nel setup attuale puo essere utile anche:

```env
SUPABASE_MANAGEMENT_API_TOKEN=
```

Serve per applicare script SQL remoti con il comando dedicato.

### Avvio sviluppo

```bash
npm run dev
```

### Build produzione

```bash
npm run build
```

## Deploy (Vercel)

Stato: deploy gestito su Vercel (Next.js App Router).

Punti pratici importanti:

- aggiungere le variabili ambiente su Vercel sia per Production che per Preview (almeno `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- dopo ogni modifica delle env su Vercel e necessario un redeploy
- gli errori “Supabase non configurato” in produzione possono dipendere da env mancanti, progetto Vercel sbagliato o valori con spazi/whitespace
- con Supabase Auth vanno configurati correttamente `Site URL` e `Redirect URLs` per i domini Vercel (e per localhost in sviluppo)

## Supabase (Auth + Database)

Stato: Supabase e il backend unico (Auth + Postgres + RLS + RPC + Realtime).

Auth:

- email/password: login, signup, sessione
- reset password: pagina dedicata `/reset-password` (gestione `code` PKCE e token hash)
- OAuth: Google attivo lato app (richiede provider abilitato su Supabase e redirect URLs corretti); Apple predisposto lato UI
- profilo obbligatorio: dopo login/signup l’utente viene guidato a completare nome/cognome/telefono prima di proseguire

Database:

- disponibilita e anti-overlap: logica critica su RPC SQL (es. `create_booking`, `cancel_booking`, `get_booking_availability`)
- RLS: isolamento dati per utente con `auth.uid()`

## Script npm

- `npm run dev`: avvia Next.js in sviluppo
- `npm run build`: build produzione
- `npm run start`: avvia la build
- `npm run lint`: lint del progetto
- `npm run supabase:apply-sql`: applica un file SQL remoto via Management API
- `npm run supabase:fix-booking`: applica il fix della migration `0004`
- `npm run supabase:apply-admin-wallet`: applica la migration admin + wallet reale (`0005`)
- `npm run admin:set -- <userId|email>`: imposta `app_metadata.role = "admin"` (usa `SUPABASE_SERVICE_ROLE_KEY`)

## Migration Supabase

Cartella:

- `supabase/migrations`

Migration attuali:

- `0001_init.sql`
- `0002_booking_availability.sql`
- `0003_privacy_security_hardening.sql`
- `0004_fix_create_booking_ambiguity.sql`
- `0005_admin_and_wallet.sql`
- `0006_fix_wallet_rpc_ambiguity.sql`
- `0007_station_layout_map.sql`
- `0008_cancel_booking_refund_policy.sql`
- `0009_update_cancel_policy_48h.sql`
- `0010_coupons_and_extensions.sql` … `0020_fix_create_booking_column_ambiguity.sql`
- `20260618113223_admin_audit_logs.sql`
- `20260625203300_multi_tenancy.sql` (introduzione tenant + RLS per tenant)
- `20260626125000_tenants_public_read_rls.sql`
- `20260626130000_multisalone_shared_accounts.sql` (Opzione A — account condiviso; vedi sezione Multi-tenancy)

La migration `0004` corregge il bug SQL che impediva la prenotazione reale.

## Stato funzionale del codice

### Gia stabile

- auth base
- dashboard privata
- cani CRUD essenziale
- wallet saldo
- prenotazione reale
- disponibilita realtime
- export calendario
- dettaglio prenotazione
- privacy endpoints principali

### Limiti attuali

- il bundle multi-servizio e oggi soprattutto UX/logica applicativa; nel database la prenotazione resta basata su una singola postazione principale
- non c'e ancora integrazione nativa OAuth con Google Calendar, solo link diretto e `.ics`
- non e presente ancora una vista storica completa delle prenotazioni con filtri avanzati
- Stripe e predisposto nelle env example ma non ancora documentato come flusso pagamento completo nel codice attuale

## Roadmap naturale consigliata

Prossimi miglioramenti coerenti con lo stato attuale:

- salvare esplicitamente i servizi multipli nella prenotazione
- distinguere storico e prossimi appuntamenti
- aggiungere cancellazione prenotazione da dashboard
- aggiungere dettagli piu ricchi nella card prenotazione
- migliorare gestione pagamenti wallet reali
- aggiungere documentazione legale e operativa

## File importanti da conoscere

- `src/app/(app)/home-client.tsx`
- `src/app/(app)/prenota/page.tsx`
- `src/app/(app)/prenota/nuova/booking-wizard-client.tsx`
- `src/app/(app)/prenotazioni/[bookingId]/page.tsx`
- `src/lib/booking-planner.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `middleware.ts`
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0004_fix_create_booking_ambiguity.sql`
- `PRIVACY-SECURITY.md`

## Note operative

- Non esporre mai `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_MANAGEMENT_API_TOKEN` al frontend.
- Non committare `.env.local`.
- Se Supabase entra in sospensione per inattivita, auth e fetch possono fallire finche il progetto non viene riattivato.
- In sviluppo, alcuni errori `_next` possono dipendere da cache HMR o artefatti `.next` corrotti.
- Su Vercel: dopo env update serve redeploy; e fondamentale che Supabase Auth abbia `Site URL` e `Redirect URLs` allineati al dominio pubblico.

## Sintesi finale

DogWash24 e oggi una base gia concreta per una SaaS di toilettatura self-service:

- ha autenticazione reale
- ha database reale
- ha prenotazione reale
- ha wallet e storico base
- ha disponibilita e calendario
- ha protezioni minime sensate lato sicurezza/privacy

Il progetto e gia usabile come MVP evoluto, con spazio chiaro per rifinire modello dati multi-servizio, dettaglio storico, pagamenti e documentazione legale.
