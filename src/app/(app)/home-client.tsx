"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, CalendarDays, PawPrint, Sparkles, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
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
      const { data } = await supabase.auth.getSession();
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-500/20">
            <Sparkles className="h-8 w-8 text-blue-300" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Self-Service Dog Wash</h1>
          <p className="mx-auto max-w-sm text-slate-300">
            Prenota il tuo lavaggio, ricarica il saldo e usa le postazioni in totale autonomia direttamente dal tuo smartphone.
          </p>
        </section>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 ring-1 ring-slate-800">
                1
              </div>
              <div>
                <p className="font-medium">Crea un account</p>
                <p className="text-sm text-slate-400">Registrati gratuitamente in pochi secondi.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 ring-1 ring-slate-800">
                2
              </div>
              <div>
                <p className="font-medium">Ricarica il saldo</p>
                <p className="text-sm text-slate-400">Acquista crediti per i lavaggi.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 ring-1 ring-slate-800">
                3
              </div>
              <div>
                <p className="font-medium">Prenota e lava</p>
                <p className="text-sm text-slate-400">Scegli la vasca e l&apos;orario perfetto per te e il tuo cane.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="pt-4">
          <Link href="/login">
            <Button className="w-full" variant="primary" size="lg">
              <LogIn className="h-5 w-5 mr-2" />
              Accedi o Registrati
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // --- VISTA CLIENTE LOGGATO (DASHBOARD) ---
  const minutes = Math.max(0, Math.floor(balanceCredits ?? 0));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
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
                  <CardContent className="pt-4">
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
