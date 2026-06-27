"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { getTenantIdFromClient } from "@/lib/tenant-client";
import { LogIn, Mail, UserPlus, ArrowLeft, Home, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

type AuthMode = "signin" | "signup";

function resolvePostLoginPath(nextPath: string, user: { app_metadata?: { role?: string } } | null | undefined) {
  const role = user?.app_metadata?.role;
  
  if (role === "superadmin") {
    return nextPath.startsWith("/superadmin") ? nextPath : "/superadmin";
  }
  
  if (role === "admin") {
    return nextPath.startsWith("/admin") ? nextPath : "/admin";
  }
  
  if (nextPath.startsWith("/admin") || nextPath.startsWith("/superadmin")) {
    return "/";
  }
  
  return nextPath;
}

function isProfileComplete(profile: { first_name: string | null; last_name: string | null; phone: string | null } | null | undefined) {
  const firstName = String(profile?.first_name ?? "").trim();
  const lastName = String(profile?.last_name ?? "").trim();
  const phone = String(profile?.phone ?? "").trim();
  return Boolean(firstName && lastName && phone);
}

function buildAuthCallbackUrl(nextPath: string) {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

function buildPasswordResetUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/reset-password`;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-10 text-sm text-slate-300">Caricamento...</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const isConfigured = Boolean(supabase);
  const nextPath = useMemo(() => {
    const value = searchParams?.get("next");
    return value && value.startsWith("/") ? value : "/";
  }, [searchParams]);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  const maybeRequireProfileCompletion = useCallback(
    async (user: any) => {
      if (!supabase) return false;
      const role = user?.app_metadata?.role;
      if (role === "admin" || role === "superadmin") return false;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("first_name,last_name,phone")
        .eq("id", String(user?.id ?? ""))
        .maybeSingle();

      if (error) return false;
      if (isProfileComplete(profile as any)) return false;

      const postLogin = resolvePostLoginPath(nextPath, user as any);
      const target = `/profilo?complete=1&next=${encodeURIComponent(postLogin)}`;
      router.replace(target as Route);
      router.refresh();
      return true;
    },
    [nextPath, router, supabase]
  );

  // Reindirizza l'utente se ha già una sessione attiva
  useEffect(() => {
    if (!supabase) return;
    const code = searchParams?.get("code");
    const shouldHandleCode = Boolean(code);
    const shouldHandleHash = typeof window !== "undefined" && Boolean(window.location.hash);
    if (shouldHandleCode || shouldHandleHash) return;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const redirected = await maybeRequireProfileCompletion(user as any);
        if (redirected) return;
        window.location.href = resolvePostLoginPath(nextPath, user as any);
      }
    })();
  }, [supabase, searchParams, nextPath, maybeRequireProfileCompletion]);

  useEffect(() => {
    if (!supabase) return;

    const code = searchParams?.get("code");
    const shouldHandleCode = Boolean(code);
    const shouldHandleHash = typeof window !== "undefined" && Boolean(window.location.hash);

    if (!shouldHandleCode && !shouldHandleHash) return;

    void (async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setMessage(toFriendlyMessage(error, "Link non valido o scaduto. Genera un nuovo link e riprova."));
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            url.searchParams.delete("type");
            window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
            return;
          }

          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          url.searchParams.delete("type");
          window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
        } else if (typeof window !== "undefined" && window.location.hash) {
          const hash = window.location.hash.replace(/^#/, "");
          const hashParams = new URLSearchParams(hash);

          if (hashParams.get("error") || hashParams.get("error_code")) {
            setMessage("Link non valido o scaduto. Genera un nuovo link e riprova.");
            return;
          }

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (!accessToken || !refreshToken) {
            setMessage("Link non valido o incompleto. Genera un nuovo link e riprova.");
            return;
          }

          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) {
            setMessage(String(error.message || "Accesso non riuscito."));
            return;
          }

          const cleaned = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, cleaned);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setMessage("Sessione non trovata dopo il login.");
          return;
        }

        const redirected = await maybeRequireProfileCompletion(user as any);
        if (redirected) return;

        window.location.href = resolvePostLoginPath(nextPath, user as any);
      } catch (e: any) {
        setMessage(String(e?.message ?? "Accesso non riuscito."));
      }
    })();
  }, [maybeRequireProfileCompletion, nextPath, searchParams, supabase]);

  const toFriendlyMessage = (e: any, fallback: string) => {
    const msg = String(e?.message ?? "");
    const lower = msg.toLowerCase();

    if (lower.includes("name not resolved") || lower.includes("dns") || lower.includes("failed to fetch") || lower.includes("fetch failed")) {
      return "Connessione a Supabase non riuscita. Controlla URL e chiave in .env.local e riavvia il server di sviluppo.";
    }
    if (lower.includes("pkce") && lower.includes("code verifier")) {
      return "Questo link e' stato aperto in un browser/dispositivo diverso da quello che ha avviato la procedura. Apri il link nello stesso browser (non dentro l'app Gmail) oppure ripeti il login/registrazione e poi usa il link appena ricevuto.";
    }
    if (lower.includes("invalid login credentials")) return "Credenziali non valide. Controlla email e password.";
    if (lower.includes("email not confirmed")) return "Email non confermata. Controlla la posta e conferma la registrazione, poi accedi.";
    if (lower.includes("password should be at least")) return "Password troppo corta. Scegli una password piu lunga.";
    if (lower.includes("user already registered")) return "Esiste gia un account con questa email. Prova ad accedere.";

    return msg || fallback;
  };

  const validate = () => {
    if (mode === "signup") {
      if (!firstName.trim()) return "Inserisci il tuo nome.";
      if (!lastName.trim()) return "Inserisci il tuo cognome.";
    }
    if (!email || !password) return "Inserisci email e password.";
    if (password.length < 6) return "La password deve avere almeno 6 caratteri.";
    return null;
  };

  const signIn = async () => {
    if (!supabase) return;
    setMessage(null);
    setCanResend(false);
    const validation = validate();
    if (validation) return setMessage(validation);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const redirected = await maybeRequireProfileCompletion(data.user as any);
      if (redirected) return;

      window.location.href = resolvePostLoginPath(nextPath, data.user as any);
    } catch (e: any) {
      setMessage(toFriendlyMessage(e, "Accesso non riuscito."));
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    if (!supabase) return;
    setMessage(null);
    setCanResend(false);
    const validation = validate();
    if (validation) return setMessage(validation);
    setLoading(true);
    try {
      const emailRedirectTo = buildAuthCallbackUrl(nextPath);
      const tenantId = await getTenantIdFromClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            tenant_id: tenantId
          }
        }
      });
      if (error) throw error;

      // Salva nome e cognome nel profilo appena creato (best-effort)
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        });
      }

      if (data.session) {
        const redirected = await maybeRequireProfileCompletion(data.session.user as any);
        if (redirected) return;

        window.location.href = resolvePostLoginPath(nextPath, data.session.user as any);
      } else {
        setMessage("Account creato! Controlla la email e conferma la registrazione, poi torna qui e accedi.");
        setCanResend(true);
      }
    } catch (e: any) {
      setMessage(toFriendlyMessage(e, "Registrazione non riuscita."));
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!supabase) return;
    setMessage(null);
    if (!email) return setMessage("Inserisci la email usata in registrazione.");
    setLoading(true);
    try {
      const emailRedirectTo = buildAuthCallbackUrl(nextPath);
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });
      if (error) throw error;
      setMessage("Email di conferma inviata. Controlla la posta (anche spam).");
    } catch (e: any) {
      setMessage(toFriendlyMessage(e, "Invio email non riuscito."));
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!supabase) return;
    setMessage(null);
    setCanResend(false);
    if (!email) return setMessage("Inserisci la tua email e poi premi di nuovo per ricevere il link di reset.");
    setLoading(true);
    try {
      const redirectTo = buildPasswordResetUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMessage("Ti abbiamo inviato il link per reimpostare la password. Controlla la posta e anche la cartella spam.");
    } catch (e: any) {
      setMessage(toFriendlyMessage(e, "Invio link di reset non riuscito."));
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: "google" | "apple") => {
    if (!supabase) return;
    setMessage(null);
    setCanResend(false);
    setLoading(true);
    try {
      const redirectTo = buildAuthCallbackUrl(nextPath);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (e: any) {
      setMessage(toFriendlyMessage(e, `Accesso con ${provider === "google" ? "Google" : "Apple"} non riuscito.`));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10 pb-28">
      {/* ── Logo ufficiale ──────────────────────────────── */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Torna alla Home">
          <div className="mx-auto w-44 max-w-full">
            <Image
              src="/logo.png"
              alt="Taglio24 - Smart Booking"
              width={440}
              height={440}
              priority
              className="h-auto w-full"
            />
          </div>
        </Link>
        <p className="text-xs text-slate-500 tracking-wide">La piattaforma per i saloni di taglio H24</p>
      </div>

      <div className="mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna alla Home
        </Link>
      </div>
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Accesso</p>
          <p className="text-lg font-semibold tracking-tight">Accedi o crea un account</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured ? (
            <div className="rounded-2xl bg-slate-950/40 p-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800">
              Per abilitare il login serve configurare Supabase in <span className="font-medium">.env.local</span>.
            </div>
          ) : null}

          {/* ── Tab switcher: stile tab (non button pieno) per non confondersi col pulsante submit ── */}
          <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1">
            <button
              type="button"
              onClick={() => { setMode("signin"); setMessage(null); setCanResend(false); }}
              disabled={!isConfigured || loading}
              className={[
                "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                mode === "signin"
                  ? "bg-slate-950 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
            >
              <LogIn className="h-4 w-4 shrink-0" />
              Accedi
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setMessage(null); setCanResend(false); }}
              disabled={!isConfigured || loading}
              className={[
                "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                mode === "signup"
                  ? "bg-slate-950 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              Crea account
            </button>
          </div>

          {message ? (
            <div className="rounded-2xl bg-slate-950/40 p-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800">
              {message}
            </div>
          ) : null}

          <form 
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === "signup" ? signUp() : signIn());
            }}
          >
            {/* ── Campi solo per Crea account ── */}
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nome <span className="text-red-400">*</span></Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="Mario"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={!isConfigured || loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Cognome <span className="text-red-400">*</span></Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Rossi"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={!isConfigured || loading}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@email.it"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isConfigured || loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isConfigured || loading}
              />
              {mode === "signup" && (
                <p className="text-xs text-slate-500">Minimo 6 caratteri</p>
              )}
            </div>

            <Button className="w-full" variant="primary" type="submit" disabled={!isConfigured || loading}>
              {mode === "signup" ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
              {mode === "signup" ? "Crea account" : "Accedi"}
            </Button>
          </form>

          <div className="grid gap-2">
            {canResend ? (
              <Button className="w-full" variant="secondary" type="button" onClick={() => void resendConfirmation()} disabled={!isConfigured || loading}>
                <Mail className="h-5 w-5" />
                Reinvia email di conferma
              </Button>
            ) : null}

            {/* ── Recupera password: solo in modalità login ── */}
            {mode === "signin" ? (
              <Button className="w-full" variant="secondary" type="button" onClick={() => void requestPasswordReset()} disabled={!isConfigured || loading}>
                <Mail className="h-5 w-5" />
                Recupera password
              </Button>
            ) : null}

            {/* ── OAuth: sempre disponibile (crea account o accedi) ── */}
            <Button className="w-full" variant="secondary" type="button" onClick={() => void signInWithOAuth("google")} disabled={!isConfigured || loading}>
              <span className="text-base font-semibold">G</span>
              {mode === "signup" ? "Registrati con Google" : "Continua con Google"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Mini Bottom Nav (identica alla BottomNav principale) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 px-2 pb-[calc(env(safe-area-inset-bottom))] pt-2">
          <Link
            href="/"
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] leading-none text-slate-300 hover:text-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          >
            <Home className="h-5 w-5 text-slate-300" aria-hidden="true" />
            <span className="truncate">Home</span>
          </Link>
          <Link
            href={"/prenota" as Route}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] leading-none text-slate-300 hover:text-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          >
            <CalendarDays className="h-5 w-5 text-slate-300" aria-hidden="true" />
            <span className="truncate">Disponibilità</span>
          </Link>
          <Link
            href={"/login" as Route}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] leading-none text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            aria-current="page"
          >
            <LogIn className="h-5 w-5 text-blue-300" aria-hidden="true" />
            <span className="truncate">Accedi</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
