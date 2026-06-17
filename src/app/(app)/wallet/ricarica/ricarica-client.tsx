"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, ShieldCheck } from "lucide-react";
import type { WalletPackId } from "@/store/wallet-store";

const packMap: Record<WalletPackId, { title: string; subtitle: string; credits: number }> = {
  starter: { title: "Starter", subtitle: "10€ = 10 crediti", credits: 10 },
  premium: { title: "Premium", subtitle: "25€ = 30 crediti", credits: 30 },
  max: { title: "Max", subtitle: "50€ = 65 crediti", credits: 65 }
};

export function RicaricaClient({ pack }: { pack: WalletPackId }) {
  const router = useRouter();
  const resolved = useMemo(() => packMap[pack] ?? packMap.starter, [pack]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Ricarica</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Checkout demo (locale). Nella fase Stripe questa pagina diventa pagamento reale con Apple Pay/Google Pay.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Pacchetto</p>
          <p className="text-lg font-semibold tracking-tight">{resolved.title}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
            <p className="text-sm font-semibold">{resolved.subtitle}</p>
            <p className="mt-1 text-xs text-slate-300">Accredito immediato sul wallet (solo demo).</p>
          </div>

          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2 ring-1 ring-inset ring-emerald-500/30">
                <ShieldCheck className="h-5 w-5 text-emerald-200" />
              </div>
              <div>
                <p className="text-sm font-semibold">Sicurezza</p>
                <p className="mt-1 text-xs text-slate-300">
                  In produzione: Stripe + webhook, transazione DB e ledger su token_transactions.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1" variant="secondary" onClick={() => router.back()}>
              Indietro
            </Button>
            <Button
              className="flex-1"
              variant="primary"
              disabled={loading}
              onClick={() => void (async () => {
                setLoading(true);
                setMessage(null);
                try {
                  // Prova prima ad avviare Stripe Checkout
                  const stripeRes = await fetch("/api/wallet/stripe-checkout", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ pack })
                  });
                  const stripeBody = await stripeRes.json().catch(() => null);

                  if (stripeRes.ok && stripeBody?.url) {
                    window.location.href = stripeBody.url;
                    return;
                  }

                  // Fallback su ricarica demo locale se Stripe non è configurato o fallisce
                  console.log("[Ricarica] Fallback su ricarica demo...");
                  const res = await fetch("/api/wallet/topup", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ pack })
                  });
                  const body = await res.json().catch(() => null);
                  if (!res.ok) {
                    const err = body && typeof body === "object" && "error" in body ? String((body as any).error) : "Ricarica non riuscita.";
                    setMessage(err);
                    return;
                  }
                  router.push("/wallet?success=true");
                } catch (e: any) {
                  setMessage(String(e?.message ?? "Ricarica non riuscita."));
                } finally {
                  setLoading(false);
                }
              })()}
            >
              <CreditCard className="h-5 w-5" />
              {loading ? "Conferma..." : "Conferma"}
            </Button>
          </div>
          {message ? (
            <div className="rounded-2xl bg-slate-950/40 p-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800">
              {message}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
