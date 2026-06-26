import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  Calendar,
  Users,
  CreditCard,
  MapPin,
  Zap,
  Tag,
  Monitor,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Scissors,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function AdminHomePage() {
  const { supabase } = await requireAdmin({ next: "/admin", mode: "notFound" });

  const now = new Date();
  const todayStart = startOfToday(now).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const monthStart = startOfMonth(now).toISOString();

  const fourteenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).toISOString();

  // Fetch tutti i dati in parallelo
  const [
    { data: sessionsData },
    { data: todayBookings },
    { data: customersData },
    { data: monthCharges },
    { data: alertBookings },
    { data: chartCharges },
  ] = await Promise.all([
    // Sessioni attive
    supabase.from("active_sessions").select("id, station_id", { count: "exact" }),
    // Prenotazioni di oggi (escluse annullate)
    supabase
      .from("bookings")
      .select("id, status, assisted", { count: "exact" })
      .gte("start_time", todayStart)
      .lt("start_time", todayEnd)
      .neq("status", "CANCELLED" as any),
    // Totale clienti
    supabase.from("admin_customers_overview").select("customer_id, balance_credits"),
    // Ricavi mese corrente
    supabase
      .from("token_transactions")
      .select("amount_credits, amount_currency")
      .eq("type", "CHARGE" as any)
      .gte("created_at", monthStart),
    // Prenotazioni PENDING non gestite
    supabase
      .from("bookings")
      .select("id")
      .eq("status", "PENDING" as any),
    // Transazioni ultimi 14 giorni per grafico
    supabase
      .from("token_transactions")
      .select("amount_currency, created_at")
      .eq("type", "CHARGE" as any)
      .gte("created_at", fourteenDaysAgo),
  ]);

  const liveSessions = sessionsData?.length ?? 0;
  const todayBookingsCount = todayBookings?.length ?? 0;
  const todayConfirmed = (todayBookings ?? []).filter((b) => (b as { status: string }).status === "CONFIRMED").length;
  const todayAssisted = (todayBookings ?? []).filter((b) => (b as { assisted?: boolean }).assisted).length;
  const todaySelfService = todayBookingsCount - todayAssisted;
  const totalCustomers = customersData?.length ?? 0;
  const monthRevenue = (monthCharges ?? []).reduce((sum, t) => sum + Number((t as { amount_currency?: string | null }).amount_currency ?? 0), 0);
  const pendingCount = alertBookings?.length ?? 0;

  // Prepara dati grafico
  const revenueByDate: Record<string, number> = {};
  ((chartCharges as any[]) ?? []).forEach((c) => {
    if (!c.created_at) return;
    const date = c.created_at.split("T")[0];
    const amount = Number(c.amount_currency ?? 0);
    revenueByDate[date] = (revenueByDate[date] ?? 0) + amount;
  });
  const chartData = Object.entries(revenueByDate).map(([date, amount]) => ({ date, amount }));

  // Alert critici
  const alerts: { label: string; tone: "amber" | "rose" | "emerald" }[] = [];
  if (pendingCount > 0) alerts.push({ label: `${pendingCount} prenotazion${pendingCount === 1 ? "e" : "i"} in attesa di conferma`, tone: "amber" });
  if (liveSessions > 0) alerts.push({ label: `${liveSessions} session${liveSessions === 1 ? "e" : "i"} live attiv${liveSessions === 1 ? "a" : "e"} ora`, tone: "emerald" });

  const kpiCards = [
    {
      label: "Sessioni live",
      value: String(liveSessions),
      sub: liveSessions === 0 ? "Struttura libera" : "Postazioni in uso",
      Icon: Zap,
      href: "/admin/sessioni",
      tone: liveSessions > 0 ? "cyan" : "slate",
    },
    {
      label: "Prenotazioni oggi",
      value: String(todayBookingsCount),
      sub: `${todayConfirmed} conf. (${todaySelfService} self / ${todayAssisted} ass.)`,
      Icon: Calendar,
      href: "/admin/prenotazioni",
      tone: "blue",
    },
    {
      label: "Ricavo mese",
      value: fmtCurrency(monthRevenue),
      sub: `${monthCharges?.length ?? 0} ricariche nel mese`,
      Icon: CreditCard,
      href: "/admin/pagamenti",
      tone: "emerald",
    },
    {
      label: "Clienti registrati",
      value: String(totalCustomers),
      sub: "Profili attivi",
      Icon: Users,
      href: "/admin/clienti",
      tone: "violet",
    },
  ] as const;

  const toneStyles = {
    cyan:    { card: "border-cyan-500/20 bg-cyan-950/10",    icon: "bg-cyan-500/15 text-cyan-300",    value: "text-cyan-100" },
    blue:    { card: "border-blue-500/20 bg-blue-950/10",    icon: "bg-blue-500/15 text-blue-300",    value: "text-blue-100" },
    emerald: { card: "border-emerald-500/20 bg-emerald-950/10", icon: "bg-emerald-500/15 text-emerald-300", value: "text-emerald-100" },
    violet:  { card: "border-violet-500/20 bg-violet-950/10", icon: "bg-violet-500/15 text-violet-300", value: "text-violet-100" },
    slate:   { card: "border-slate-700/50 bg-slate-900/20",  icon: "bg-slate-800 text-slate-400",    value: "text-slate-200" },
  } as const;

  const quickLinks = [
    { href: "/admin/prenotazioni", label: "Prenotazioni",  Icon: Calendar,   sub: "Gestisci e filtra" },
    { href: "/admin/sessioni",     label: "Sessioni live", Icon: Zap,        sub: "Monitor H24" },
    { href: "/admin/kiosk",        label: "Kiosk",         Icon: Monitor,    sub: "Scanner QR" },
    { href: "/admin/clienti",      label: "Clienti",       Icon: Users,      sub: "Saldi e profili" },
    { href: "/admin/pagamenti",    label: "Pagamenti",     Icon: CreditCard, sub: "Ledger crediti" },
    { href: "/admin/postazioni",   label: "Postazioni",    Icon: MapPin,     sub: "Mappa e layout" },
    { href: "/admin/servizi",      label: "Servizi",       Icon: Scissors,   sub: "Listino e tariffe" },
    { href: "/admin/coupons",      label: "Coupon",        Icon: Tag,        sub: "Codici promo" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Dashboard</p>
        <h2 className="text-2xl font-semibold tracking-tight">Benvenuto nell&apos;area admin</h2>
        <p className="text-sm text-slate-400">
          Panoramica operativa in tempo reale — {new Intl.DateTimeFormat("it-IT", {
            weekday: "long", day: "2-digit", month: "long", year: "numeric"
          }).format(now)}
        </p>
      </header>

      {/* Alert critici */}
      {alerts.length > 0 && (
        <div className="grid gap-2">
          {alerts.map((a) => (
            <div
              key={a.label}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ring-1 ring-inset ${
                a.tone === "rose"
                  ? "bg-rose-500/10 text-rose-200 ring-rose-500/25"
                  : a.tone === "amber"
                  ? "bg-amber-500/10 text-amber-200 ring-amber-500/25"
                  : "bg-emerald-500/10 text-emerald-200 ring-emerald-500/25"
              }`}
            >
              {a.tone === "emerald" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              {a.label}
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((kpi) => {
          const styles = toneStyles[kpi.tone];
          return (
            <Link key={kpi.href} href={kpi.href}>
              <div
                className={`group relative overflow-hidden rounded-3xl border p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${styles.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.icon}`}>
                    <kpi.Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-slate-400" />
                </div>
                <div className="mt-4">
                  <p className={`text-2xl font-bold tracking-tight ${styles.value}`}>{kpi.value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-400">{kpi.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{kpi.sub}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Analytics Chart */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Analitiche</p>
          <p className="text-lg font-semibold tracking-tight">Fatturato (Ultimi 14 giorni)</p>
        </CardHeader>
        <CardContent>
          <RevenueChart data={chartData} />
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Navigazione rapida</p>
          <p className="text-lg font-semibold tracking-tight">Sezioni admin</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href as any}>
                <div className="group flex items-center gap-3 rounded-2xl bg-slate-900/40 p-3 ring-1 ring-inset ring-slate-800/60 transition-all hover:bg-slate-800/60 hover:ring-slate-700">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 transition-colors group-hover:bg-cyan-500/15 group-hover:text-cyan-300">
                    <link.Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{link.label}</p>
                    <p className="text-[11px] text-slate-500">{link.sub}</p>
                  </div>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer info */}
      <div className="flex items-center gap-2 rounded-2xl bg-slate-900/30 px-4 py-3 text-[11px] text-slate-500 ring-1 ring-inset ring-slate-800/40">
        <TrendingUp className="h-3.5 w-3.5 text-cyan-500/70" />
        <span>DogWash24 — Area Admin. Tutti i dati sono in tempo reale da Supabase.</span>
      </div>
    </div>
  );
}
