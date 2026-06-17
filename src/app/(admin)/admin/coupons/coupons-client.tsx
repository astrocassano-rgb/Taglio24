"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Gift, Percent, Plus, Trash2, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

type Coupon = {
  id: string;
  code: string;
  amount_credits: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  created_at: string;
};

type Props = {
  initialCoupons: Coupon[];
};

export function CouponsClient({ initialCoupons }: Props) {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [code, setCode] = useState("");
  const [amountCredits, setAmountCredits] = useState<number>(10);
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || amountCredits <= 0) return;

    setLoading(true);
    setMessage(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          amount_credits: Number(amountCredits),
          max_uses: maxUses.trim() ? Number(maxUses) : null,
          expires_at: expiresAt || null
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Impossibile creare il coupon.");
        return;
      }

      setSuccess(true);
      setMessage(`Coupon ${data.coupon.code} creato con successo!`);
      
      // Reset form
      setCode("");
      setAmountCredits(10);
      setMaxUses("");
      setExpiresAt("");

      // Update state
      setCoupons([data.coupon, ...coupons]);
      router.refresh();
    } catch {
      setMessage("Errore durante la creazione del coupon.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Sei sicuro di voler eliminare questo coupon?")) return;

    try {
      const res = await fetch(`/api/admin/coupons?id=${id}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        alert("Impossibile eliminare il coupon.");
        return;
      }
      setCoupons(coupons.filter((c) => c.id !== id));
      router.refresh();
    } catch {
      alert("Errore durante l'eliminazione.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Create form */}
      <Card className="self-start">
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Nuovo Coupon</p>
          <p className="text-lg font-semibold tracking-tight">Crea codice promozionale</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="coupon_code" className="text-sm font-medium text-slate-200">
                Codice Coupon
              </label>
              <Input
                id="coupon_code"
                placeholder="ES. BENVENUTO10"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-11 uppercase"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="amount_credits" className="text-sm font-medium text-slate-200">
                Crediti in regalo
              </label>
              <Input
                id="amount_credits"
                type="number"
                min="1"
                value={amountCredits}
                onChange={(e) => setAmountCredits(Number(e.target.value))}
                className="h-11"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="max_uses" className="text-sm font-medium text-slate-200">
                Usi Massimi (opzionale)
              </label>
              <Input
                id="max_uses"
                type="number"
                min="1"
                placeholder="Illimitati"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="h-11"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="expires_at" className="text-sm font-medium text-slate-200">
                Scadenza (opzionale)
              </label>
              <Input
                id="expires_at"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-11"
                disabled={loading}
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              <Plus className="h-5 w-5" />
              {loading ? "Creazione..." : "Crea Coupon"}
            </Button>

            {message && (
              <p className={cn("text-xs font-medium text-center", success ? "text-emerald-400" : "text-rose-400")}>
                {message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Lista</p>
          <p className="text-lg font-semibold tracking-tight">Codici promozionali attivi</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {coupons.length ? (
                coupons.map((c) => {
                  const isExpired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
                  const isExhausted = c.max_uses !== null && c.current_uses >= c.max_uses;

                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={cn(
                        "rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
                        (isExpired || isExhausted) && "opacity-60"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-semibold tracking-wider text-slate-50">{c.code}</span>
                          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-200 ring-1 ring-inset ring-blue-500/30">
                            +{c.amount_credits} crediti
                          </span>
                          {isExpired && (
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-200 ring-1 ring-inset ring-rose-500/30">
                              Scaduto
                            </span>
                          )}
                          {isExhausted && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-inset ring-amber-500/30">
                              Esaurito
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                            Usi: {c.current_uses} / {c.max_uses ?? "Illimitati"}
                          </span>
                          {c.expires_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-500" />
                              Scade: {new Date(c.expires_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        className="self-end sm:self-center text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-10 w-10 p-0"
                        onClick={() => void handleDelete(c.id)}
                        aria-label={`Elimina coupon ${c.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-slate-400">
                  Nessun codice promozionale creato. Usa il form a sinistra per crearne uno.
                </div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
