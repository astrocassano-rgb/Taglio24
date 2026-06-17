"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CreditCard, CalendarDays, PawPrint, LogIn, Mail, Lock, UserPlus, Apple } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGoogleCalendarUrl } from "@/lib/booking-planner";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";
import type { Database } from "@/types/database";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Pick<Database["public"]["Tables"]["dogs"]["Row"], "id" | "name">;
type Station = Pick<Database["public"]["Tables"]["stations"]["Row"], "id" | "name">;

export default function HomeClient() {
  const router = useRouter();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const [isLogged, setIsLogged] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [balanceCredits, setBalanceCredits] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [dogNames, setDogNames] = useState<Record<string, string>>({});
  const [stationNames, setStationNames] = useState<Record<string, string>>({});

  // Stati per il form di autenticazione integrato
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let mounted = true;
    const checkAuth = async () => {
      const { data } = await safeGetSession(supabase);
      if (mounted) {
        setIsLogged(!!data.session);
        setUserId(data.session?.user.id ?? null);
        setLoading(false);
      }
    };
    void checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsLogged(!!session);
        setUserId(session?.user?.id ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const maybeRequireProfileCompletion = async (user: any) => {
    if (!supabase) return false;
    if (user?.app_metadata?.role === "admin") return false;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("first_name,last_name,phone")
      .eq("id", String(user?.id ?? ""))
      .maybeSingle();

    if (error) return false;
    
    const isProfileComplete = (prof: any) => {
      const firstName = String(prof?.first_name ?? "").trim();
      const lastName = String(prof?.last_name ?? "").trim();
      const phone = String(prof?.phone ?? "").trim();
      return Boolean(firstName && lastName && phone);
    };

    if (isProfileComplete(profile)) return false;

    const target = `/profilo?complete=1&next=${encodeURIComponent("/")}`;
    router.replace(target as Route);
    router.refresh();
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthMessage(null);
    setCanResend(false);
    if (!email || !password) {
      setAuthMessage("Inserisci email e password.");
      return;
    }
    if (password.length < 6) {
      setAuthMessage("La password deve avere almeno 6 caratteri.");
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const redirected = await maybeRequireProfileCompletion(data.user as any);
      if (redirected) return;
      router.refresh();
    } catch (err: any) {
      setAuthMessage(toFriendlyMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthMessage(null);
    setCanResend(false);
    if (!email || !password) {
      setAuthMessage("Inserisci email e password.");
      return;
    }
    if (password.length < 6) {
      setAuthMessage("La password deve avere almeno 6 caratteri.");
      return;
    }
    setAuthLoading(true);
    try {
      const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/login?next=${encodeURIComponent("/")}` : undefined;
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
      if (error) throw error;
      if (data.session) {
        const redirected = await maybeRequireProfileCompletion(data.session.user as any);
        if (redirected) return;
        router.refresh();
      } else {
        setAuthMessage("Account creato! Conferma la registrazione tramite il link inviato per email.");
        setCanResend(true);
      }
    } catch (err: any) {
      setAuthMessage(toFriendlyMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResend = async () => {
    if (!supabase || !email) return;
    setAuthMessage(null);
    setAuthLoading(true);
    try {
      const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/login?next=${encodeURIComponent("/")}` : undefined;
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });
      if (error) throw error;
      setAuthMessage("Email di conferma reinviata. Controlla la posta.");
    } catch (err: any) {
      setAuthMessage(toFriendlyMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    if (!supabase) return;
    setAuthMessage(null);
    setAuthLoading(true);
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login?next=${encodeURIComponent("/")}` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
    } catch (err: any) {
      setAuthMessage(`Errore di accesso con ${provider === "google" ? "Google" : "Apple"}.`);
      setAuthLoading(false);
    }
  };

  const toFriendlyMessage = (err: any) => {
    const msg = String(err?.message ?? "");
    const lower = msg.toLowerCase();
    if (lower.includes("invalid login credentials")) return "Credenziali non valide. Controlla email e password.";
    if (lower.includes("email not confirmed")) return "Email non confermata. Conferma la registrazione tramite il link inviato via mail.";
    if (lower.includes("user already registered")) return "Esiste già un account registrato con questa email. Prova ad accedere.";
    return msg || "Si è verificato un errore.";
  };

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
      <div className="space-y-6 py-4 max-w-md mx-auto">
        <section className="text-center space-y-3">
          <div className="mx-auto w-44 max-w-full">
            <Image
              src="/logo.png"
              alt="DogWash24 - Self Service Toilettatura"
              width={440}
              height={440}
              priority
              className="h-auto w-full"
            />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Self-Service H24</p>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            DogWash24
          </h1>
          <p className="mx-auto max-w-xs text-sm text-slate-400 leading-relaxed">
            La soluzione self-service per la cura e il lavaggio del tuo cane, accessibile a qualsiasi ora del giorno e della notte.
          </p>
        </section>

        <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl overflow-hidden">
          <CardHeader className="space-y-1 pb-3 border-b border-slate-800/40 bg-slate-950/20">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Area Riservata</p>
            <p className="text-lg font-bold text-slate-100">Accedi o crea un account</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={authMode === "signin" ? "primary" : "secondary"}
                className="w-full rounded-2xl h-11 transition-all duration-200 cursor-pointer"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthMessage(null);
                  setCanResend(false);
                }}
                disabled={authLoading}
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Accedi
              </Button>
              <Button
                type="button"
                variant={authMode === "signup" ? "primary" : "secondary"}
                className="w-full rounded-2xl h-11 transition-all duration-200 cursor-pointer"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMessage(null);
                  setCanResend(false);
                }}
                disabled={authLoading}
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Registrati
              </Button>
            </div>

            {authMessage && (
              <div className="rounded-2xl bg-slate-950/50 p-3 text-xs text-slate-300 ring-1 ring-inset ring-slate-800/80 leading-relaxed">
                {authMessage}
              </div>
            )}

            <form
              className="space-y-3.5"
              onSubmit={authMode === "signup" ? handleSignUp : handleSignIn}
            >
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1" htmlFor="email">
                  Indirizzo Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@email.it"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={authLoading}
                    className="bg-slate-950/40 border-slate-800/80 rounded-2xl h-12 pl-10 focus-visible:ring-blue-500/50 text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={authLoading}
                    className="bg-slate-950/40 border-slate-800/80 rounded-2xl h-12 pl-10 focus-visible:ring-blue-500/50 text-slate-100"
                  />
                </div>
              </div>

              <Button
                className="w-full rounded-2xl h-12 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/10 cursor-pointer mt-1"
                variant="primary"
                type="submit"
                disabled={authLoading}
              >
                {authMode === "signup" ? (
                  <>
                    <UserPlus className="h-5 w-5 mr-1.5" />
                    Crea account
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 mr-1.5" />
                    Accedi ora
                  </>
                )}
              </Button>
            </form>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/40">
              {canResend && (
                <Button
                  className="w-full rounded-2xl h-10 text-xs border border-slate-800 bg-slate-950/30 hover:bg-slate-900/40 cursor-pointer"
                  variant="secondary"
                  type="button"
                  onClick={handleResend}
                  disabled={authLoading}
                >
                  <Mail className="h-4 w-4 mr-1.5" />
                  Reinvia email di conferma
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="w-full rounded-2xl h-10 text-xs border border-slate-800 bg-slate-950/30 hover:bg-slate-900/40 cursor-pointer"
                  variant="secondary"
                  type="button"
                  onClick={() => handleOAuth("google")}
                  disabled={authLoading}
                >
                  <span className="text-sm font-bold mr-1.5">G</span>
                  Google
                </Button>
                <Button
                  className="w-full rounded-2xl h-10 text-xs border border-slate-800 bg-slate-950/30 hover:bg-slate-900/40 cursor-pointer"
                  variant="secondary"
                  type="button"
                  onClick={() => handleOAuth("apple")}
                  disabled={authLoading}
                >
                  <Apple className="h-4 w-4 mr-1.5" />
                  Apple
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="pt-2 text-center">
          <Link href="/piattaforma" className="text-xs font-semibold text-slate-400 underline-offset-4 hover:underline hover:text-slate-200 transition-colors">
            Sei un gestore? Scopri la piattaforma DogWash24
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
