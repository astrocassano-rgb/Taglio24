"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-10 text-sm text-slate-300">Caricamento...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    void (async () => {
      try {
        const code = searchParams?.get("code");
        const shouldHandleHash = typeof window !== "undefined" && Boolean(window.location.hash);

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const raw = String((error as any)?.message ?? "");
            const lower = raw.toLowerCase();
            if (lower.includes("pkce") && lower.includes("code verifier")) {
              setMessage("Questo link di reset e' stato aperto in un browser/dispositivo diverso da quello che ha avviato la procedura. Apri il link nello stesso browser oppure richiedi un nuovo reset.");
            } else {
              setMessage("Link di reset non valido o scaduto. Generane uno nuovo e riprova.");
            }
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
        } else if (shouldHandleHash) {
          const hash = window.location.hash.replace(/^#/, "");
          const hashParams = new URLSearchParams(hash);

          if (hashParams.get("error") || hashParams.get("error_code")) {
            setMessage("Link di reset non valido o scaduto. Generane uno nuovo e riprova.");
            return;
          }

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (!accessToken || !refreshToken) {
            setMessage("Link di reset incompleto. Generane uno nuovo e riprova.");
            return;
          }

          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) {
            setMessage("Link di reset non valido o scaduto. Generane uno nuovo e riprova.");
            return;
          }

          const cleaned = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, cleaned);
        }

        const { data } = await safeGetSession(supabase);
        if (!data.session) {
          setMessage("Sessione mancante o link scaduto. Genera un nuovo link di reset e riprova.");
          return;
        }

        setReady(true);
      } catch (e: any) {
        setMessage(String(e?.message ?? "Verifica del link di reset non riuscita."));
      }
    })();
  }, [searchParams, supabase]);

  const submit = async () => {
    if (!supabase) return;
    setMessage(null);
    if (password.length < 8) {
      setMessage("Password troppo corta (minimo 8 caratteri).");
      return;
    }

    setLoading(true);
    try {
      const { data } = await safeGetSession(supabase);
      if (!data.session) {
        setMessage("Sessione mancante o link scaduto. Genera un nuovo link di reset e riprova.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(String((error as any)?.message ?? "Impostazione password non riuscita."));
        return;
      }

      await supabase.auth.signOut();
      router.replace("/login?reset=success" as Route);
      router.refresh();
    } catch (e: any) {
      setMessage(String(e?.message ?? "Impostazione password non riuscita."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Sicurezza</p>
          <p className="text-lg font-semibold tracking-tight">Imposta una nuova password</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-2xl bg-slate-950/40 p-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800">
              {message}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="password">Nuova password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!supabase || loading || !ready}
            />
          </div>

          <Button className="w-full" variant="primary" onClick={() => void submit()} disabled={!supabase || loading || !ready}>
            {loading ? "Salvataggio..." : "Salva password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
