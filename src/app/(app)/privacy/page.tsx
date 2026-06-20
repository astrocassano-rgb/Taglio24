import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — DogWash24",
  description: "Informativa sulla privacy e sul trattamento dei dati personali di DogWash24.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 pb-24 text-slate-300">
      <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-slate-500 mb-10">Ultimo aggiornamento: giugno 2026</p>

      {/* Intro */}
      <div className="rounded-2xl bg-blue-500/5 border border-blue-500/10 p-5 mb-8">
        <p className="text-sm leading-relaxed">
          La presente informativa descrive come <strong className="text-slate-200">DogWash24</strong> raccoglie, utilizza e protegge i dati
          personali degli utenti, ai sensi del <strong className="text-slate-200">Regolamento UE 2016/679 (GDPR)</strong> e
          del <strong className="text-slate-200">D.Lgs. 196/2003</strong> (Codice Privacy italiano).
        </p>
      </div>

      {/* 1. Titolare */}
      <Section title="1. Titolare del Trattamento">
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4">
          <p className="text-sm">
            <strong className="text-slate-200">DogWash24</strong><br />
            Email: <a href="mailto:info@dogwash24.it" className="text-blue-400 underline">info@dogwash24.it</a><br />
            Sito: <a href="https://dogwash24.it" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">dogwash24.it</a>
          </p>
        </div>
      </Section>

      {/* 2. Dati Raccolti */}
      <Section title="2. Dati Raccolti">
        <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">2.1 Dati di registrazione</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Nome, cognome, email, numero di telefono</li>
        </ul>

        <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">2.2 Dati degli animali</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Nome, razza, taglia, foto profilo del cane</li>
        </ul>

        <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">2.3 Dati di prenotazione e sessione</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Data, orario, servizio scelto, postazione assegnata</li>
          <li>Saldo wallet (crediti acquistati e transazioni)</li>
        </ul>

        <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-2">2.4 Dati di pagamento</h3>
        <p className="text-sm">
          I pagamenti sono gestiti interamente da{" "}
          <a href="https://stripe.com/it/privacy" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
            Stripe
          </a>. Nessun numero di carta viene memorizzato sui nostri server.
        </p>
      </Section>

      {/* 3. Finalità */}
      <Section title="3. Finalità del Trattamento">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong className="text-slate-200">Erogazione del servizio</strong> — gestione prenotazioni, sessioni, wallet</li>
          <li><strong className="text-slate-200">Comunicazioni di servizio</strong> — conferme, promemoria, notifiche WhatsApp</li>
          <li><strong className="text-slate-200">Sicurezza</strong> — audit log, prevenzione frodi</li>
          <li><strong className="text-slate-200">Miglioramento</strong> — analisi aggregate e anonimizzate</li>
        </ul>
      </Section>

      {/* 4. Base Giuridica */}
      <Section title="4. Base Giuridica">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong className="text-slate-200">Art. 6(1)(b) GDPR</strong> — Esecuzione contratto</li>
          <li><strong className="text-slate-200">Art. 6(1)(a) GDPR</strong> — Consenso (notifiche marketing)</li>
          <li><strong className="text-slate-200">Art. 6(1)(f) GDPR</strong> — Legittimo interesse (sicurezza)</li>
        </ul>
      </Section>

      {/* 5. Conservazione */}
      <Section title="5. Conservazione dei Dati">
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 space-y-2 text-sm">
          <p>• <strong className="text-slate-200">Dati account</strong> — fino a cancellazione dell&apos;account</p>
          <p>• <strong className="text-slate-200">Prenotazioni</strong> — 24 mesi dopo la data di servizio</p>
          <p>• <strong className="text-slate-200">Dati fiscali</strong> — 10 anni (D.P.R. 600/1973)</p>
          <p>• <strong className="text-slate-200">Log di sicurezza</strong> — 12 mesi</p>
        </div>
      </Section>

      {/* 6. Terze Parti */}
      <Section title="6. Condivisione con Terze Parti">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong className="text-slate-200">Supabase</strong> — database e autenticazione (server UE)</li>
          <li><strong className="text-slate-200">Stripe</strong> — elaborazione pagamenti</li>
          <li><strong className="text-slate-200">Vercel</strong> — hosting applicazione</li>
        </ul>
        <p className="text-sm mt-3">Nessun dato viene venduto a terze parti.</p>
      </Section>

      {/* 7. Diritti */}
      <Section title="7. I Tuoi Diritti">
        <p className="text-sm mb-3">Ai sensi degli articoli 15-22 del GDPR, hai diritto di:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong className="text-slate-200">Accesso</strong> — ottenere copia dei tuoi dati</li>
          <li><strong className="text-slate-200">Rettifica</strong> — correggere dati inesatti</li>
          <li><strong className="text-slate-200">Cancellazione</strong> — diritto all&apos;oblio</li>
          <li><strong className="text-slate-200">Portabilità</strong> — export dati in formato JSON</li>
          <li><strong className="text-slate-200">Opposizione</strong> — opporti al trattamento</li>
        </ul>

        <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-5 mt-4">
          <p className="text-sm leading-relaxed">
            <strong className="text-emerald-300">Come esercitare i tuoi diritti:</strong> Vai in{" "}
            <strong className="text-slate-200">Profilo → Esporta dati</strong> per scaricare i tuoi dati, oppure usa{" "}
            <strong className="text-slate-200">Profilo → Elimina account</strong> per cancellarli. Per altre richieste:{" "}
            <a href="mailto:info@dogwash24.it" className="text-blue-400 underline">info@dogwash24.it</a>.
          </p>
        </div>

        <p className="text-sm mt-4">
          Hai il diritto di proporre reclamo all&apos;Autorità Garante per la Protezione dei Dati Personali (
          <a href="https://www.garanteprivacy.it" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
            garanteprivacy.it
          </a>).
        </p>
      </Section>

      {/* 8. Cookie */}
      <Section title="8. Cookie">
        <p className="text-sm mb-3">DogWash24 utilizza esclusivamente cookie tecnici strettamente necessari:</p>
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 text-sm space-y-2">
          <p>• <strong className="text-slate-200">sb-*-auth-token</strong> — sessione di autenticazione Supabase</p>
        </div>
        <p className="text-sm mt-3">
          <strong className="text-slate-200">Non utilizziamo</strong> cookie di profilazione, analytics o remarketing.
        </p>
      </Section>

      {/* 9. Sicurezza */}
      <Section title="9. Misure di Sicurezza">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Crittografia in transito (HTTPS/TLS) e a riposo</li>
          <li>Controllo accessi basato su ruoli (RLS)</li>
          <li>Audit log delle azioni amministrative</li>
          <li>Pagamenti PCI DSS compliant (via Stripe)</li>
          <li>Token check-in con firma HMAC-SHA256</li>
        </ul>
      </Section>

      {/* 10. Modifiche */}
      <Section title="10. Modifiche alla Policy">
        <p className="text-sm">
          Ci riserviamo il diritto di aggiornare questa informativa. Le modifiche saranno pubblicate su questa pagina
          con la data di ultimo aggiornamento evidenziata.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-100 mb-3">{title}</h2>
      {children}
    </section>
  );
}
