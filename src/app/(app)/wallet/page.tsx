"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Euro, Gift, Receipt } from "lucide-react";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";

type WalletPackId = "starter" | "premium" | "max";

const packs: { id: WalletPackId; title: string; subtitle: string; price: string; credits: number; badge: string | null }[] = [
  { id: "starter", title: "Starter", subtitle: "10€ = 10 crediti", price: "10€", credits: 10, badge: null },
  { id: "premium", title: "Premium", subtitle: "25€ = 30 crediti", price: "25€", credits: 30, badge: "+5 bonus" },
  { id: "max", title: "Max", subtitle: "50€ = 65 crediti", price: "50€", credits: 65, badge: "+10 bonus" }
];

export default function WalletPage() {
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const [balanceCredits, setBalanceCredits] = useState<number | null>(null);

  useEffect(() => {
    async function loadWallet() {
      if (!supabase) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase
        .from("wallets")
        .select("balance_credits")
        .eq("customer_id", userData.user.id)
        .maybeSingle();

      setBalanceCredits(data?.balance_credits ?? 0);
    }
    void loadWallet();
  }, [supabase]);

  const minutes = Math.max(0, Math.floor(balanceCredits ?? 0));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Wallet</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Ricarica crediti con carta, Apple Pay o Google Pay. Tutte le transazioni vengono registrate in modo tracciabile.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Saldo</p>
          <p className="text-lg font-semibold tracking-tight">Crediti disponibili</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800">
              <p className="text-xs text-slate-300">Crediti</p>
              <p className="mt-1 text-2xl font-semibold">{balanceCredits ?? "--"}</p>
            </div>
            <div className="rounded-xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800">
              <p className="text-xs text-slate-300">Minuti stimati</p>
              <p className="mt-1 text-2xl font-semibold">{minutes}</p>
            </div>
          </div>
          <Link href="/wallet/movimenti">
            <Button className="w-full" variant="secondary">
              <Receipt className="h-5 w-5" />
              Vedi movimenti
            </Button>
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Ricarica</h3>
          <span className="text-xs text-slate-300">Scegli un pacchetto</span>
        </div>

        <div className="grid gap-3">
          {packs.map((p) => (
            <Card key={p.title} className="overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{p.title}</p>
                      {p.badge ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/30">
                          {p.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{p.subtitle}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold">{p.price}</p>
                    <p className="mt-1 text-xs text-slate-300">{p.credits} crediti</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <Link className="flex-1" href={`/wallet/ricarica?pack=${p.id}`}>
                    <Button className="w-full" variant="primary">
                      <CreditCard className="h-5 w-5" />
                      Paga
                    </Button>
                  </Link>
                  <Button className="w-12 px-0" variant="ghost" aria-label="Dettagli prezzo">
                    <Euro className="h-5 w-5" />
                  </Button>
                  <Button className="w-12 px-0" variant="ghost" aria-label="Bonus">
                    <Gift className="h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
