"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { CreditCard, CalendarDays, PawPrint, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createGoogleCalendarUrl } from "@/lib/booking-planner";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";
import type { Database } from "@/types/database";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Pick<Database["public"]["Tables"]["dogs"]["Row"], "id" | "name">;
type Station = Pick<Database["public"]["Tables"]["stations"]["Row"], "id" | "name">;

export default function HomeClient() {
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const [isLogged, setIsLogged] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [balanceCredits, setBalanceCredits] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [dogNames, setDogNames] = useState<Record<string, string>>({});
  const [stationNames, setStationNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function checkAuth() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await safeGetSession(supabase);
      setIsLogged(!!data.session);
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    }
    void checkAuth();
  }, [supabase]);

  useEffect(() => {
    async function loadDashboard() {
      if (!supabase || !userId) return;

      const [{ data: wallet }, { data: bookings }] = await Promise.all([
        supabase.from("wallets").select("balance_credits").eq("customer_id", userId).maybeSingle(),
        supabase
          .from("bookings")
          .select("id, dog_id, station_id, start_time, end_time, status, total_credits, customer_id, created_at")
          .eq("customer_id", userId)
          .in("status", ["PENDING", "CONFIRMED"])
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true })
          .limit(5)
      ]);

      setBalanceCredits(wallet?.balance_credits ?? 0);
      setUpcoming(bookings ?? []);

      const dogIds = Array.from(new Set((bookings ?? []).map((b) => b.dog_id))).filter(Boolean);
      const stationIds = Array.from(new Set((bookings ?? []).map((b) => b.station_id))).filter(Boolean);

      const [dogsRes, stationsRes] = await Promise.all([
        dogIds.length ? supabase.from("dogs").select("id, name").in("id", dogIds) : Promise.resolve({ data: [] as Dog[] }),
        stationIds.length ? supabase.from("stations").select("id, name").in("id", stationIds) : Promise.resolve({ data: [] as Station[] })
      ]);

      const nextDogNames: Record<string, string> = {};
      for (const d of (dogsRes.data ?? []) as Dog[]) nextDogNames[d.id] = d.name;
      setDogNames(nextDogNames);

      const nextStationNames: Record<string, string> = {};
      for (const s of (stationsRes.data ?? []) as Station[]) nextStationNames[s.id] = s.name;
      setStationNames(nextStationNames);
    }

    void loadDashboard();
  }, [supabase, userId]);

  if (loading) {
    return <div className="p-4 text-center text-sm text-slate-400">Caricamento in corso...</div>;
  }

  // --- VISTA OSPITE (LANDING PAGE) ---
  if (!isLogged) {
    return (
      <div className="space-y-6 py-4">
        <section className="text-center space-y-4">
          <div className="mx-auto w-56 max-w-full">
            <Image
              src="/logo.png"
              alt="DogWash24 - Self Service Toilettatura"
              width={560}
              height={560}
              priority
              className="h-auto w-full"
            />
          </div>
          <p className="text-xs font-medium tracking-wide text-slate-400">Toilettatura · Self-Service</p>
          <h1 className="text-3xl font-bold tracking-tight">Prenota il lavaggio del tuo cane</h1>
          <p className="mx-auto max-w-sm text-slate-300">
            Una webapp per prenotare vasche e postazioni, gestire i profili dei tuoi cani e pagare con crediti in modo semplice e veloce.
          </p>
        </section>

        <section className="grid gap-3">
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium text-slate-300">Funzionalita</p>
              <p className="text-lg font-semibold tracking-tight">Cosa puoi fare, passo dopo passo</p>
              <p className="text-sm leading-relaxed text-slate-400">
                Una sola area per capire subito sia cosa puoi gestire nell&apos;app sia come funziona il percorso di prenotazione.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-3xl bg-gradient-to-br from-blue-500/15 to-cyan-500/10 p-4 ring-1 ring-inset ring-blue-500/20">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-inset ring-blue-400/30">
                    <CalendarDays className="h-6 w-6 text-blue-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-50">1. Crea l&apos;account e accedi</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-blue-200">Inizio rapido</p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300">
                      Entri nella tua area personale e sblocchi la prenotazione reale, lo storico e la gestione completa del servizio.
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100">
                      Accesso, dashboard e prenotazione attiva
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-gradient-to-br from-emerald-500/15 to-lime-500/10 p-4 ring-1 ring-inset ring-emerald-500/20">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-inset ring-emerald-400/30">
                    <PawPrint className="h-6 w-6 text-emerald-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-50">2. Inserisci i dati del tuo cane</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-200">Scheda completa</p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300">
                      Salvi nome, taglia, peso e note utili per avere profili ordinati, pronti da usare per ogni nuova prenotazione.
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-200">
                      Profili cane, note e storico utilizzo
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-4 ring-1 ring-inset ring-amber-500/20">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-inset ring-amber-400/30">
                    <CreditCard className="h-6 w-6 text-amber-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-50">3. Ricarica, scegli slot e conferma</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-200">Prenotazione</p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300">
                      Controlli il wallet, verifichi disponibilita di giorni e orari e prenoti la postazione migliore per il tuo cane.
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-200">
                      Crediti, disponibilita e conferma slot
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-3 pt-2">
          <Link href="/login">
            <Button className="w-full" variant="primary" size="lg">
              <LogIn className="h-5 w-5 mr-2" />
              Accedi o Registrati
            </Button>
          </Link>
          <Link href="/prenota?start=true">
            <Button className="w-full" variant="secondary" size="lg">
              <CalendarDays className="h-5 w-5 mr-2" />
              Vedi disponibilità
            </Button>
          </Link>
          <p className="text-center text-xs text-slate-400">
            La prenotazione viene confermata solo dopo l&apos;accesso.
          </p>
          <div className="pt-2 text-center">
            <Link href="/piattaforma" className="text-xs font-medium text-slate-300 underline-offset-4 hover:underline">
              Sei un gestore o un distributore? Scopri la piattaforma DogWash24
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA CLIENTE LOGGATO (DASHBOARD) ---
  const minutes = Math.max(0, Math.floor(balanceCredits ?? 0));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="DogWash24"
            width={120}
            height={120}
            className="h-8 w-auto"
          />
          <p className="text-xs font-medium tracking-wide text-slate-400">Toilettatura · Self-Service</p>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">La tua Dashboard</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Gestisci il tuo credito, prenota una postazione e controlla le tue prenotazioni.
        </p>
      </section>

      <Card className="overflow-hidden border-blue-500/20 bg-blue-950/10">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-200">Saldo Disponibile</p>
            <CreditCard className="h-4 w-4 text-blue-300" />
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-bold tracking-tight">{balanceCredits ?? "--"}</p>
            <p className="text-sm text-slate-400">crediti</p>
          </div>
          <p className="text-xs text-slate-400">{minutes} minuti stimati</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Link className="flex-1" href="/wallet">
              <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0" variant="primary">
                Ricarica
              </Button>
            </Link>
            <Link className="flex-1" href="/prenota">
              <Button className="w-full border-blue-500/30 text-blue-100 hover:bg-blue-500/10" variant="secondary">
                Prenota
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/prenota" className="block">
          <Card className="h-full hover:bg-slate-900/50 transition-colors">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Prenota</p>
                  <p className="mt-1 text-xs text-slate-400">Seleziona giorno</p>
                </div>
                <CalendarDays className="h-5 w-5 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/cani" className="block">
          <Card className="h-full hover:bg-slate-900/50 transition-colors">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">I miei cani</p>
                  <p className="mt-1 text-xs text-slate-400">Gestisci profili</p>
                </div>
                <PawPrint className="h-5 w-5 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      <section className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Prossimi appuntamenti</h3>
        </div>
        {upcoming.length ? (
          <div className="grid gap-3">
            {upcoming.map((b) => {
              const start = new Date(b.start_time);
              const end = new Date(b.end_time);
              const day = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short" }).format(start);
              const startTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(start);
              const endTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(end);
              const station = stationNames[b.station_id] ?? "Postazione";
              const dog = dogNames[b.dog_id] ?? "Cane";

              return (
                <Card key={b.id}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          {day} · {startTime}–{endTime}
                        </p>
                        <p className="text-xs text-slate-400">
                          {station} · {dog}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{b.total_credits} crediti</p>
                        <p className="text-xs text-slate-400">{b.status}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Link
                        href={`/prenotazioni/${b.id}` as Route}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900/70 px-3 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
                      >
                        Dettagli
                      </Link>
                      <a
                        href={createGoogleCalendarUrl({
                          title: `DogWash24 - ${dog}`,
                          details: `${station} · Prenotazione DogWash24 per ${dog}`,
                          location: station,
                          startIso: b.start_time,
                          endIso: b.end_time
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900/70 px-3 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
                      >
                        Google Calendar
                      </a>
                      <a
                        href={`/api/bookings/${b.id}/calendar`}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900/70 px-3 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
                      >
                        Scarica .ics
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-slate-400">Nessuna prenotazione futura.</CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
