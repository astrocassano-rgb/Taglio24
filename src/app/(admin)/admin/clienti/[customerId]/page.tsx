import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ChevronRight, User, Mail, Phone, CreditCard, Fingerprint, Dog, ArrowRight } from "lucide-react";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type DogRow = Database["public"]["Tables"]["dogs"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
type Tx = Database["public"]["Tables"]["token_transactions"]["Row"];
type TxType = "CHARGE" | "DEBIT" | "BONUS" | "ADJUSTMENT" | "REFUND";
type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export const dynamic = "force-dynamic";

function fmtDateTime(value: string) {
  const d = new Date(value);
  const day = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day} · ${time}`;
}

function TxTypeBadge({ type, credits }: { type: string; credits: number }) {
  const map: Record<TxType, { cls: string; sign: string }> = {
    CHARGE:     { cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25", sign: "+" },
    DEBIT:      { cls: "bg-rose-500/15 text-rose-200 ring-rose-500/25",          sign: "-" },
    BONUS:      { cls: "bg-blue-500/15 text-blue-200 ring-blue-500/25",           sign: "+" },
    ADJUSTMENT: { cls: "bg-amber-500/15 text-amber-200 ring-amber-500/25",        sign: "" },
    REFUND:     { cls: "bg-violet-500/15 text-violet-200 ring-violet-500/25",     sign: "+" },
  };
  const { cls, sign } = map[type as TxType] ?? { cls: "bg-slate-800 text-slate-300 ring-slate-700", sign: "" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${cls}`}>
      {sign}{Math.abs(credits)} cr · {type}
    </span>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<BookingStatus, { label: string; cls: string }> = {
    PENDING:   { label: "In attesa",  cls: "bg-amber-500/15 text-amber-200 ring-amber-500/25" },
    CONFIRMED: { label: "Confermata", cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25" },
    COMPLETED: { label: "Completata", cls: "bg-blue-500/15 text-blue-200 ring-blue-500/25" },
    CANCELLED: { label: "Annullata",  cls: "bg-rose-500/15 text-rose-200 ring-rose-500/25" },
  };
  const { label, cls } = map[status as BookingStatus] ?? { label: status, cls: "bg-slate-800 text-slate-300 ring-slate-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

export default async function AdminClienteDettaglioPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const { supabase } = await requireAdmin({ next: `/admin/clienti/${customerId}`, mode: "notFound" });

  const [{ data: profile }, { data: dogs }, { data: wallet }, { data: bookings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", customerId).maybeSingle(),
    supabase.from("dogs").select("*").eq("owner_id", customerId).order("created_at", { ascending: false }),
    supabase.from("wallets").select("*").eq("customer_id", customerId).maybeSingle(),
    supabase.from("bookings").select("*").eq("customer_id", customerId).order("start_time", { ascending: false }).limit(30),
  ]);

  if (!profile) notFound();

  const profileRow = profile as Profile;
  const dogsRows = (dogs ?? []) as DogRow[];
  const walletRow = (wallet ?? null) as Wallet | null;
  const bookingsRows = (bookings ?? []) as Booking[];

  const walletId = walletRow?.id ?? null;
  const { data: txs } = walletId
    ? await supabase.from("token_transactions").select("*").eq("wallet_id", walletId).order("created_at", { ascending: false }).limit(30)
    : { data: [] as Tx[] };

  const txRows = (txs ?? []) as Tx[];
  const fullName = [profileRow.first_name, profileRow.last_name].filter(Boolean).join(" ").trim();
  const title = fullName || profileRow.email || customerId;
  const initials = (fullName || profileRow.email || "?").slice(0, 2).toUpperCase();
  const balance = walletRow?.balance_credits ?? 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <header className="space-y-2">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/admin/clienti" className="hover:text-slate-300 transition-colors">Clienti</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300 font-medium">{title}</span>
        </nav>
        <div className="flex items-center gap-4">
          {/* Avatar grande */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, #06b6d4, #14b8a6)" }}
          >
            {initials}
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-slate-400">Profilo, cani, prenotazioni e wallet.</p>
          </div>
        </div>
      </header>

      {/* Profilo */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-cyan-400">Profilo</p>
          <p className="text-lg font-semibold tracking-tight">Dati cliente</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/50 p-3 ring-1 ring-inset ring-slate-800">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                <p className="text-sm text-slate-100 truncate">{profileRow.email ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/50 p-3 ring-1 ring-inset ring-slate-800">
              <Phone className="h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Telefono</p>
                <p className="text-sm text-slate-100">{profileRow.phone ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/50 p-3 ring-1 ring-inset ring-slate-800">
              <Fingerprint className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">ID</p>
                <p className="text-xs text-slate-400 font-mono truncate">{profileRow.id}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wallet */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-cyan-400">Wallet</p>
          <p className="text-lg font-semibold tracking-tight">Saldo e ricarica manuale</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Saldo prominente */}
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-slate-900/40 p-4 ring-1 ring-inset ring-cyan-500/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15">
              <CreditCard className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <p className="text-2xl font-bold text-cyan-100">{balance}</p>
              <p className="text-xs text-slate-400">crediti disponibili</p>
            </div>
          </div>

          <form action="/api/admin/wallet/adjust" method="post" className="grid gap-3">
            <input type="hidden" name="customer_id" value={customerId} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount_credits">Crediti (positivo = accredito, negativo = storno)</Label>
                <Input id="amount_credits" name="amount_credits" placeholder="es. 10 oppure -5" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo</Label>
                <Input id="reason" name="reason" placeholder="es. Bonus test / Rimborso manuale" />
              </div>
            </div>
            <Button variant="primary" type="submit">Applica aggiustamento</Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {/* Cani */}
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-cyan-400">Cani</p>
            <p className="text-lg font-semibold tracking-tight">Profili ({dogsRows.length})</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {dogsRows.length ? (
              dogsRows.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-slate-900/40 p-3 ring-1 ring-inset ring-slate-800">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-sm">
                    🐶
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-50">{d.name}</p>
                    <p className="text-xs text-slate-400">
                      {[d.breed, d.size, d.weight ? `${d.weight} kg` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Link href={`/admin/cani/${d.id}`} className="shrink-0">
                    <Button variant="secondary" size="icon" className="h-8 w-8 rounded-xl bg-slate-800/50 hover:bg-slate-800 border-0">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 rounded-2xl bg-slate-900/30 p-3 text-sm text-slate-400">
                <Dog className="h-4 w-4" /> Nessun cane inserito.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transazioni */}
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-cyan-400">Movimenti</p>
            <p className="text-lg font-semibold tracking-tight">Transazioni ({txRows.length})</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {txRows.length ? (
              txRows.map((t) => (
                <div key={t.id} className="rounded-2xl bg-slate-900/40 p-3 ring-1 ring-inset ring-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <TxTypeBadge type={t.type} credits={t.amount_credits} />
                    <span className="text-[11px] text-slate-500">{fmtDateTime(t.created_at)}</span>
                  </div>
                  {t.note && <p className="mt-1 text-xs text-slate-400">{t.note}</p>}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">Nessun movimento.</div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Prenotazioni */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-cyan-400">Prenotazioni</p>
          <p className="text-lg font-semibold tracking-tight">Storico recente ({bookingsRows.length})</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookingsRows.length ? (
            bookingsRows.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900/40 p-3 ring-1 ring-inset ring-slate-800">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-50 truncate">
                    {fmtDateTime(b.start_time)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <BookingStatusBadge status={b.status} />
                    <span className="text-[11px] text-slate-500">{b.total_credits} crediti</span>
                  </div>
                </div>
                <Link href={`/admin/prenotazioni?q=${b.id}`} className="shrink-0">
                  <Button variant="secondary" className="inline-flex items-center gap-1.5 text-xs">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Apri
                  </Button>
                </Link>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400">Nessuna prenotazione.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
