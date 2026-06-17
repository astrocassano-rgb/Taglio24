"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { Apple, LogIn, Mail, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

type AuthMode = "signin" | "signup";

function resolvePostLoginPath(nextPath: string, user: { app_metadata?: { role?: string } } | null | undefined) {
  if (nextPath !== "/") return nextPath;
  return user?.app_metadata?.role === "admin" ? "/admin" : "/";
}

function buildAuthCallbackUrl(nextPath: string) {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`;
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

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

        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          setMessage(String(error?.message || "Sessione non trovata dopo il login."));
          return;
        }

        router.replace(resolvePostLoginPath(nextPath, data.session.user as any) as Route);
        router.refresh();
      } catch (e: any) {
        setMessage(String(e?.message ?? "Accesso non riuscito."));
      }
    })();
  }, [nextPath, router, searchParams, supabase]);

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
      router.replace(resolvePostLoginPath(nextPath, data.user as any) as Route);
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
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
      if (error) throw error;
      if (data.session) {
        router.replace(resolvePostLoginPath(nextPath, data.session.user as any) as Route);
      } else {
        setMessage("Account creato. Controlla la email e conferma la registrazione, poi torna qui e accedi.");
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
    <div className="mx-auto max-w-md px-4 py-10">
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

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "signin" ? "primary" : "secondary"}
              className="w-full"
              onClick={() => {
                setMode("signin");
                setMessage(null);
                setCanResend(false);
              }}
              disabled={!isConfigured || loading}
            >
              <LogIn className="h-5 w-5" />
              Accedi
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "primary" : "secondary"}
              className="w-full"
              onClick={() => {
                setMode("signup");
                setMessage(null);
                setCanResend(false);
              }}
              disabled={!isConfigured || loading}
            >
              <UserPlus className="h-5 w-5" />
              Crea account
            </Button>
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
            <Button className="w-full" variant="secondary" type="button" onClick={() => void requestPasswordReset()} disabled={!isConfigured || loading}>
              <Mail className="h-5 w-5" />
              Recupera password
            </Button>
            <Button className="w-full" variant="secondary" type="button" onClick={() => void signInWithOAuth("google")} disabled={!isConfigured || loading}>
              <span className="text-base font-semibold">G</span>
              Continua con Google
            </Button>
            <Button className="w-full" variant="secondary" type="button" onClick={() => void signInWithOAuth("apple")} disabled={!isConfigured || loading}>
              <Apple className="h-5 w-5" />
              Continua con Apple
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-slate-300">
            Intanto puoi tornare al{" "}
            <Link href="/" className="text-blue-200 underline underline-offset-4">
              dashboard
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
