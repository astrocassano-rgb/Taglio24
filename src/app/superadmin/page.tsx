import Link from "next/link";
import type { Route } from "next";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNetworkOverview, EXPIRING_SOON_DAYS, type TenantWithMetrics, getPlanPrice } from "@/lib/admin/metrics";
import {
  Building,
  Users,
  Calendar,
  Zap,
  Euro,
  Coins,
  ShieldCheck,
  ShieldAlert,
  Plus,
  ArrowRight,
  AlertTriangle,
  Clock,
  Settings,
} from "lucide-react";

export const dynamic = "force-dynamic";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("it-IT");

export default async function SuperAdminDashboard() {
  try {
    await requireSuperAdmin({ next: "/superadmin", mode: "notFound" });

    // Client service-role: aggrega dati globali bypassando la RLS.
    const adminSupabase = createSupabaseAdminClient();
    const overview = await getNetworkOverview(adminSupabase);
    const { totals, alerts, tenants } = overview;

    const kpis = [
      { label: "Saloni Registrati", value: num.format(totals.tenants), sub: `${totals.activeTenants} con abbonamento attivo`, Icon: Building, tone: "violet" },
      { label: "Clienti Totali", value: num.format(totals.uniqueCustomers), sub: "Utenti registrati unici", Icon: Users, tone: "blue" },
      { label: "Prenotazioni Totali", value: num.format(totals.bookings), sub: "Gestite dal sistema", Icon: Calendar, tone: "emerald" },
      { label: "Sessioni H24 Attive", value: num.format(totals.activeSessions), sub: "Lavaggi in corso ora", Icon: Zap, tone: "cyan" },
      { label: "Fatturato Totale", value: eur.format(totals.revenueEur), sub: "Ricariche crediti (Stripe)", Icon: Euro, tone: "amber" },
      { label: "Crediti Venduti", value: num.format(totals.creditsSold), sub: "Totale crediti acquistati", Icon: Coins, tone: "fuchsia" },
    ] as const;

    const toneStyles = {
      violet:  { card: "border-violet-500/20 bg-violet-950/10",   icon: "bg-violet-500/15 text-violet-300",   value: "text-violet-100" },
      blue:    { card: "border-blue-500/20 bg-blue-950/10",       icon: "bg-blue-500/15 text-blue-300",       value: "text-blue-100" },
      emerald: { card: "border-emerald-500/20 bg-emerald-950/10", icon: "bg-emerald-500/15 text-emerald-300", value: "text-emerald-100" },
      cyan:    { card: "border-cyan-500/20 bg-cyan-950/10",       icon: "bg-cyan-500/15 text-cyan-300",       value: "text-cyan-100" },
      amber:   { card: "border-amber-500/20 bg-amber-950/10",     icon: "bg-amber-500/15 text-amber-300",     value: "text-amber-100" },
      fuchsia: { card: "border-fuchsia-500/20 bg-fuchsia-950/10", icon: "bg-fuchsia-500/15 text-fuchsia-300", value: "text-fuchsia-100" },
    } as const;

    const hasAlerts = alerts.expired.length > 0 || alerts.expiringSoon.length > 0 || alerts.withoutAdmin.length > 0;

    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-violet-400">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">Global Control Room</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Dashboard Superadmin</h2>
            <p className="text-sm text-slate-400">Metriche, fatturato e stato di salute dell&apos;intera rete DogWash24.</p>
          </div>
          <Link href={"/superadmin/tenants/new" as Route}>
            <Button variant="primary" className="gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20">
              <Plus className="h-4 w-4" />
              Aggiungi Salone
            </Button>
          </Link>
        </header>

        {/* Grid KPI */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => {
            const style = toneStyles[kpi.tone];
            return (
              <Card key={kpi.label} className={`border ${style.card} backdrop-blur-md transition-all duration-300 hover:scale-[1.02]`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <span className="text-xs font-medium text-slate-400">{kpi.label}</span>
                  <div className={`rounded-xl p-2.5 ${style.icon}`}>
                    <kpi.Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className={`text-xl font-bold tracking-tight ${style.value}`}>{kpi.value}</p>
                  <p className="text-[10px] text-slate-500">{kpi.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Proiezione Ricavi Ricorrenti */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Proiezioni Canoni Abbonamento (Saloni Attivi)</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-cyan-500/20 bg-cyan-950/10 backdrop-blur-md transition-all duration-300 hover:scale-[1.01]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-medium text-slate-400">Mensile Ricorrente (MRR)</span>
                <div className="rounded-xl p-2.5 bg-cyan-500/15 text-cyan-300">
                  <Euro className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold tracking-tight text-cyan-100">{eur.format(totals.mrr)}</p>
                <p className="text-[10px] text-slate-500">Ricavi da canoni stimati al mese</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-500/20 bg-indigo-950/10 backdrop-blur-md transition-all duration-300 hover:scale-[1.01]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-medium text-slate-400">Stima Semestrale</span>
                <div className="rounded-xl p-2.5 bg-indigo-500/15 text-indigo-300">
                  <Euro className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold tracking-tight text-indigo-100">{eur.format(totals.semiannual)}</p>
                <p className="text-[10px] text-slate-500">Proiezione canoni a 6 mesi</p>
              </CardContent>
            </Card>

            <Card className="border-violet-500/20 bg-violet-950/10 backdrop-blur-md transition-all duration-300 hover:scale-[1.01]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-medium text-slate-400">Annuale Ricorrente (ARR)</span>
                <div className="rounded-xl p-2.5 bg-violet-500/15 text-violet-300">
                  <Euro className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold tracking-tight text-violet-100">{eur.format(totals.arr)}</p>
                <p className="text-[10px] text-slate-500">Fatturato canoni stimato all&apos;anno</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Riquadro Alert: scaduti, in scadenza, senza admin */}
        {hasAlerts && (
          <div className="grid gap-4 lg:grid-cols-3">
            <AlertCard
              tone="rose"
              Icon={AlertTriangle}
              title="Abbonamenti scaduti"
              empty="Nessun salone scaduto"
              tenants={alerts.expired}
            />
            <AlertCard
              tone="amber"
              Icon={Clock}
              title={`In scadenza (≤ ${EXPIRING_SOON_DAYS} giorni)`}
              empty="Nessuna scadenza imminente"
              tenants={alerts.expiringSoon}
            />
            <AlertCard
              tone="slate"
              Icon={ShieldAlert}
              title="Saloni senza amministratore"
              empty="Tutti i saloni hanno un admin"
              tenants={alerts.withoutAdmin}
            />
          </div>
        )}

        {/* Tabella saloni con metriche per-salone */}
        <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">Saloni & Performance</h3>
              <p className="text-xs text-slate-500">Metriche per salone: clienti, prenotazioni, fatturato e amministratori.</p>
            </div>
            <Link href={"/superadmin/tenants" as Route} className="flex items-center gap-1 text-xs text-violet-400 hover:underline">
              Gestione completa
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-900/40 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Salone</th>
                    <th className="px-3 py-3 text-right">Clienti</th>
                    <th className="px-3 py-3 text-right">Prenotazioni</th>
                    <th className="px-3 py-3 text-right">Fatturato</th>
                    <th className="px-3 py-3 text-center">Admin</th>
                    <th className="px-3 py-3 text-center">Piano</th>
                    <th className="px-3 py-3 text-center">Stato</th>
                    <th className="px-3 py-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {tenants.map((t) => (
                    <tr key={t.id} className="transition-all hover:bg-slate-900/10">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-violet-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-50 truncate">{t.name}</p>
                            <p className="font-mono text-[10px] text-slate-500 truncate">{t.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{num.format(t.metrics.customers)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{num.format(t.metrics.bookings)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-200/90">{eur.format(t.metrics.revenueEur)}</td>
                      <td className="px-3 py-3 text-center">
                        {t.metrics.admins === 0 && t.slug !== "default" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/20">
                            <ShieldAlert className="h-3 w-3" /> 0
                          </span>
                        ) : (
                          <span className="tabular-nums text-slate-300">{num.format(t.metrics.admins)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {t.slug === "default" ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-slate-200">{t.plan}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({eur.format(getPlanPrice(t.plan))}/m)
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge tenant={t} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/superadmin/tenants/${t.id}` as Route}>
                          <Button variant="secondary" className="h-8 px-2.5 gap-1 text-xs">
                            <Settings className="h-3.5 w-3.5" />
                            Gestisci
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-slate-500">Nessun salone registrato al momento.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } catch (err: any) {
    if (isRedirectError(err)) {
      throw err;
    }
    return (
      <div className="p-8 max-w-xl mx-auto mt-10 rounded-2xl border border-rose-500/20 bg-rose-950/10 text-rose-200 relative z-50">
        <h3 className="text-lg font-bold mb-2">Errore di Rendering Superadmin</h3>
        <p className="text-sm font-semibold mb-4">{err?.message || String(err)}</p>
        {err?.stack && (
          <pre className="p-3 bg-slate-900 rounded-xl text-xs font-mono overflow-auto max-h-60 text-slate-400">
            {err.stack}
          </pre>
        )}
      </div>
    );
  }
}

/** Badge di stato abbonamento (scaduto / in scadenza / attivo / senza scadenza). */
function StatusBadge({ tenant }: { tenant: TenantWithMetrics }) {
  if (tenant.isExpired) {
    return <span className="inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/20">Scaduto</span>;
  }
  if (tenant.isExpiringSoon) {
    return <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/20">In scadenza</span>;
  }
  return <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">Attivo</span>;
}

/** Card di alert con la lista compatta dei saloni coinvolti. */
function AlertCard({
  tone, Icon, title, empty, tenants,
}: {
  tone: "rose" | "amber" | "slate";
  Icon: typeof AlertTriangle;
  title: string;
  empty: string;
  tenants: TenantWithMetrics[];
}) {
  const tones = {
    rose:  { card: "border-rose-500/20 bg-rose-950/10",   icon: "text-rose-300",  count: "bg-rose-500/15 text-rose-300" },
    amber: { card: "border-amber-500/20 bg-amber-950/10", icon: "text-amber-300", count: "bg-amber-500/15 text-amber-300" },
    slate: { card: "border-slate-700/40 bg-slate-900/20", icon: "text-slate-300", count: "bg-slate-700/40 text-slate-300" },
  } as const;
  const style = tones[tone];

  return (
    <Card className={`border ${style.card} backdrop-blur-md`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${style.icon}`} />
          <span className="text-sm font-semibold text-slate-100">{title}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.count}`}>{tenants.length}</span>
      </CardHeader>
      <CardContent>
        {tenants.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">{empty}</p>
        ) : (
          <ul className="space-y-1">
            {tenants.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/superadmin/tenants/${t.id}` as Route}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-900/40"
                >
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {t.subscriptionEndsAt ? new Date(t.subscriptionEndsAt).toLocaleDateString("it-IT") : "—"}
                  </span>
                </Link>
              </li>
            ))}
            {tenants.length > 6 && (
              <li className="px-2 pt-1 text-[10px] text-slate-500">+{tenants.length - 6} altri…</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
