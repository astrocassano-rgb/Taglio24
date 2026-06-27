import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BarChart3, Clock, QrCode, ShieldCheck, Wrench, Sparkles, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Taglio24 — Piattaforma Saloni Ibrida",
  description:
    "Piattaforma per parrucchieri e barbieri self-service H24 e assistita con personale: prenotazioni, wallet crediti, dashboard admin, check-in QR e kiosk.",
  openGraph: {
    title: "Taglio24 — Piattaforma Saloni Ibrida",
    description:
      "Prenotazioni, wallet crediti, dashboard admin e flessibilità operativa: servizi self-service H24 e assistiti.",
    type: "website"
  }
};

const features: { title: string; description: string; Icon: LucideIcon }[] = [
  {
    title: "Flessibilità Ibrida (Self & Staff)",
    description: "Gestisci postazioni libere in modalità self-service H24 e l'agenda degli operatori per servizi assistiti.",
    Icon: Sparkles
  },
  {
    title: "Operatività H24 (QR + Kiosk)",
    description: "Check-in con QR firmato, kiosk postazione e sessioni live con timer: controllo operativo in struttura.",
    Icon: QrCode
  },
  {
    title: "Prenotazioni reali e anti-overbooking",
    description: "Disponibilità su DB con logica server-side: meno disguidi, meno contestazioni, più ordine.",
    Icon: Clock
  },
  {
    title: "Wallet crediti e report economici",
    description: "Saldo crediti, movimenti e dashboard admin con filtri ed export: tracciabilità e controllo.",
    Icon: BarChart3
  },
  {
    title: "Sicurezza e audit",
    description: "Auth reale, RLS, policy su operazioni sensibili e tracciabilità: base solida per crescere.",
    Icon: ShieldCheck
  },
  {
    title: "Postazioni e gestione struttura",
    description: "Anagrafica postazioni e layout editor per la mappa: visione chiara del punto vendita.",
    Icon: Wrench
  }
];

export default function PiattaformaPage() {
  return (
    <div className="space-y-8 py-6">
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Taglio24" width={160} height={160} className="h-10 w-auto" priority />
          <p className="text-xs font-medium tracking-wide text-slate-400">Taglio · Barba · Self-Service · Assistito · H24</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">La piattaforma completa per gestire Saloni di Parrucchieri & Barbieri Self-Service, Assistiti o Ibridi</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-200">
          Taglio24 unifica la gestione delle strutture: automatizza il self-service H24 con sblocco QR e chiosco fisico, e offre un&apos;agenda avanzata per le prenotazioni assistite con i tuoi operatori. Riduci la gestione manuale, ottimizza le poltrone e massimizza la resa per metro quadro.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/prenota" className="w-full sm:w-auto">
            <Button className="w-full" variant="primary">
              Vedi demo prenotazione
            </Button>
          </Link>
          <a className="w-full sm:w-auto" href="mailto:info@taglio24.it?subject=Richiesta%20demo%20Taglio24">
            <Button className="w-full" variant="secondary">
              Richiedi una demo
            </Button>
          </a>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Perché</p>
            <p className="text-lg font-semibold tracking-tight">Riduci caos operativo, aumenta controllo</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <p>
              La piattaforma unisce due mondi: l&apos;automazione H24 del self-service (prenotazione, crediti, sblocco postazione con QR) e l&apos;efficienza del salone tradizionale con operatore. Monitora sessioni live, gestisci lo staff e ottimizza l&apos;uso delle postazioni in tempo reale.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
                <p className="text-sm font-semibold text-slate-50">Flessibilità Ibrida</p>
                <p className="mt-1 text-xs text-slate-400">Configura le postazioni per il self-service, l&apos;assistenza staff o entrambi.</p>
              </div>
              <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
                <p className="text-sm font-semibold text-slate-50">Zero no-show</p>
                <p className="mt-1 text-xs text-slate-400">Il pagamento anticipato tramite wallet a crediti abbatte le prenotazioni a vuoto.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-950/10">
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-blue-200">Infrastruttura</p>
            <p className="text-lg font-semibold tracking-tight text-slate-50">Pronta per il locale</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            <p>Webapp mobile-first per i clienti, dashboard admin per lo staff e pagina Kiosk di check-in per il locale.</p>
            <p className="text-xs text-slate-400">
              Pronta per l&apos;integrazione hardware (relè): sblocco porte e avvio vasca automatico post check-in QR.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Funzionalità</p>
          <h2 className="text-xl font-semibold tracking-tight">Cosa include oggi</h2>
        </header>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ title, description, Icon }) => (
            <Card key={title}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900/70 ring-1 ring-inset ring-slate-800">
                    <Icon className="h-5 w-5 text-slate-100" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-50">{title}</p>
                    <p className="text-sm leading-relaxed text-slate-300">{description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Pacchetti</p>
          <h2 className="text-xl font-semibold tracking-tight">Modelli di utilizzo</h2>
          <p className="text-sm text-slate-300">Valori indicativi: si definiscono su numero postazioni e perimetro.</p>
        </header>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium text-slate-300">Solo utilizzo</p>
              <p className="text-lg font-semibold tracking-tight">Licenza d&apos;uso</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p className="text-2xl font-semibold tracking-tight text-slate-50">da 150 €/mese</p>
              <p>Uso piattaforma + aggiornamenti finché attivo il canone.</p>
              <p className="text-xs text-slate-400">Setup iniziale una tantum e assistenza base inclusa nel canone.</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20 bg-blue-950/10">
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium text-blue-200">Consigliato</p>
              <p className="text-lg font-semibold tracking-tight text-slate-50">Noleggio + update</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p className="text-2xl font-semibold tracking-tight text-slate-50">da 300 €/mese</p>
              <p>Gestione aggiornamenti, supporto e governance release.</p>
              <p className="text-xs text-slate-400">Ideale se vuoi “zero pensieri” e un servizio continuativo.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium text-slate-300">Acquisto</p>
              <p className="text-lg font-semibold tracking-tight">Piattaforma completa</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p className="text-2xl font-semibold tracking-tight text-slate-50">35k–120k €</p>
              <p>Acquisto IP/sorgenti + handover tecnico.</p>
              <p className="text-xs text-slate-400">Possibile esclusiva con valore dedicato.</p>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a className="w-full sm:w-auto" href="mailto:info@taglio24.it?subject=Richiesta%20offerta%20Taglio24&body=Buongiorno%2C%20vorrei%20una%20proposta%20per%20la%20piattaforma%20Taglio24.%0A%0AImpianto%3A%20%0APostazioni%3A%20%0ANote%3A%20">
            <Button className="w-full" variant="primary">
              Richiedi un&apos;offerta
            </Button>
          </a>
          <Link href="/login" className="w-full sm:w-auto">
            <Button className="w-full" variant="secondary">
              Accedi (area demo)
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

