# Taglio24 — Piattaforma SaaS Saloni Parrucchieri & Barbieri H24

Taglio24 è una piattaforma software di tipo **SaaS (Software as a Service)** concepita per digitalizzare e automatizzare i saloni di parrucchieri e barbieri, con un focus specifico sull'operatività **self-service H24 senza presidio** (sblocco cabine automatico) e formule di servizio assistito (ibrido).

Il progetto è diviso in due macro-aree integrate:
1. **Sito Web Istituzionale e Demo Vetrina Cliente** (in hosting su **Aruba**): Adibito al marketing e alla presentazione del servizio.
2. **Web App di Prenotazione e Gestione** (in hosting su **Vercel**): L'applicazione reale utilizzata da clienti e gestori.

---

## 🗺️ Architettura e Componenti del Progetto

### 1. Sito di Presentazione e Demo Cliente (`marketing-aruba/`)
Configurato per l'hosting statico su Aruba (dominio `taglio24.it`). Comprende:
* **Landing Page Istituzionale (`index.html`)**: Presenta la piattaforma SaaS ai proprietari di saloni. Include spiegazione dei vantaggi (H24, automazione, fidelizzazione), prezzi delle licenze ed email di contatto (`info@taglio24.it`).
* **Demo Vetrina Cliente (`demo-home.html`)**: Una pagina di esempio che simula la vetrina online di un'ipotetico salone affiliato (es. *"BarberStyle Milano"*). Serve come modello di marketing per far vedere ai gestori come si presenteranno ai clienti finali. Include:
  * **Cosa Offriamo**: Servizi con prezzi (Taglio, Styling, Barba, Trattamenti speciali) rappresentati con icone vettoriali SVG minimaliste in stile Apple.
  * **Boutique**: Vetrina e-commerce per la vendita di prodotti cosmetici e accessori (Cere, Balsami, Shampoo, Spazzole) con foto professionali generate dall'AI e carrello fluttuante interattivo con calcolo automatico dei crediti.
  * **Fidelizzazione**: Promozione di pacchetti prepagati una tantum e abbonamenti mensili ricorrenti per incentivare le entrate ricorrenti del salone.

### 2. Web App Real-Time (`src/`)
La piattaforma software reale, sviluppata in **Next.js 15** e ospitata su Vercel, accessibile all'indirizzo `https://taglio24.vercel.app`. Gestisce:
* **Autenticazione**: Sistema di login, registrazione e recupero password integrato tramite Supabase Auth (con supporto OAuth Google).
* **Gestione Profili di Taglio (Multi-Profile)**: Inserimento e gestione dei profili dei propri familiari o preferenze di taglio (nome, tipo di capelli, lunghezza, note del barbiere) per calcolare la durata consigliata del servizio.
* **Wallet a Crediti**: Un portafoglio virtuale interno in cui i clienti acquistano crediti prepagati per sbloccare le postazioni/cabine.
* **Wizard di Prenotazione**: Un flusso guidato che permette di selezionare il profilo di taglio, i servizi desiderati, calcolare la durata, verificare la disponibilità reale in tempo reale e prenotare.
* **Dashboard Gestore (Admin)**: Consente al proprietario del salone di monitorare le prenotazioni, gestire le postazioni (timer e stato live), consultare i guadagni (ledger) e configurare il layout grafico del salone.

---

## 🛠️ Stack Tecnologico

* **Frontend**: Next.js 15 (App Router), React 19, TypeScript (Strict Mode), Tailwind CSS per lo styling.
* **Database & Backend**: Supabase (PostgreSQL, Row Level Security, Realtime, Transazioni ed RPC in PL/pgSQL).
* **ICONE & Grafica**: Icone vettoriali SVG personalizzate e immagini prodotto generate in alta definizione.
* **FTP Deploy**: Script PowerShell autonomo (`upload_aruba.ps1`) per la sincronizzazione rapida dei file di marketing su Aruba.

---

## 💎 Linee Guida UX/UI ("Apple Feel")

L'intera piattaforma segue standard visivi premium ispirati all'ecosistema Apple:
* **Glassmorphism**: Ampio uso di sfondi semi-trasparenti sfocati (`backdrop-filter: blur(16px)`) con bordi lucidi per dare profondità.
* **OLED Theme**: Colori scuri profondi integrati da tonalità accese (Ciano, Viola e Smeraldo) per una resa ottimale su display mobile.
* **Squirkle iOS**: Bordi arrotondati generosi (`border-radius: 24px`) per card e contenitori.
* **Micro-interazioni**: Feedback visivi istantanei (zoom all'hover sui prodotti, notifiche toast elastiche, effetto spring sui click dei pulsanti).
