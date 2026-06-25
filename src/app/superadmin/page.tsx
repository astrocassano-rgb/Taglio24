import Link from "next/link";
import type { Route } from "next";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  Building,
  Users,
  Calendar,
  Zap,
  TrendingUp,
  ShieldCheck,
  Plus,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuperAdminDashboard() {
  try {
    await requireSuperAdmin({ next: "/superadmin", mode: "notFound" });
    
    // Usiamo il client di admin per bypassare RLS e aggregare i dati globali
    const adminSupabase = createSupabaseAdminClient();

    const [
      { data: tenants, error: tenantsErr },
      { count: totalUsers, error: usersErr },
      { count: totalBookings, error: bookingsErr },
      { count: activeSessions, error: sessionsErr },
    ] = await Promise.all([
      adminSupabase.from("tenants").select("*").order("created_at", { ascending: false }),
      adminSupabase.from("profiles").select("id", { count: "exact", head: true }),
      adminSupabase.from("bookings").select("id", { count: "exact", head: true }),
      adminSupabase.from("active_sessions").select("id", { count: "exact", head: true }),
    ]);

    if (tenantsErr || usersErr || bookingsErr || sessionsErr) {
      throw new Error(`Errore recupero dati DB: ${JSON.stringify({ tenantsErr, usersErr, bookingsErr, sessionsErr })}`);
    }

    const tenantsList = tenants || [];
    const activeTenants = tenantsList.filter((t) => {
      if (!t.subscription_ends_at) return true;
      return new Date(t.subscription_ends_at) > new Date();
    }).length;

    const kpis = [
      {
        label: "Saloni Registrati",
        value: String(tenantsList.length),
        sub: `${activeTenants} con abbonamento attivo`,
        Icon: Building,
        tone: "violet",
      },
      {
        label: "Clienti Totali",
        value: String(totalUsers ?? 0),
        sub: "Registrati su tutti i saloni",
        Icon: Users,
        tone: "blue",
      },
      {
        label: "Prenotazioni Totali",
        value: String(totalBookings ?? 0),
        sub: "Gestite dal sistema",
        Icon: Calendar,
        tone: "emerald",
      },
      {
        label: "Sessioni H24 Attive",
        value: String(activeSessions ?? 0),
        sub: "Lavaggi in corso in questo istante",
        Icon: Zap,
        tone: "cyan",
      },
    ] as const;

    const toneStyles = {
      violet:  { card: "border-violet-500/20 bg-violet-950/10", icon: "bg-violet-500/15 text-violet-300", value: "text-violet-100" },
      blue:    { card: "border-blue-500/20 bg-blue-950/10",    icon: "bg-blue-500/15 text-blue-300",    value: "text-blue-100" },
      emerald: { card: "border-emerald-500/20 bg-emerald-950/10", icon: "bg-emerald-500/15 text-emerald-300", value: "text-emerald-100" },
      cyan:    { card: "border-cyan-500/20 bg-cyan-950/10",    icon: "bg-cyan-500/15 text-cyan-300",    value: "text-cyan-100" },
    } as const;

    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-violet-400">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">Global Control Room</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Dashboard Superadmin</h2>
            <p className="text-sm text-slate-400">Riepilogo delle metriche e dello stato di salute dell&apos;intera rete DogWash24.</p>
          </div>
          <Link href={"/superadmin/tenants/new" as Route}>
            <Button variant="primary" className="gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20">
              <Plus className="h-4 w-4" />
              Aggiungi Salone
            </Button>
          </Link>
        </header>

        {/* Grid KPI */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  <p className={`text-2xl font-bold tracking-tight ${style.value}`}>{kpi.value}</p>
                  <p className="text-[10px] text-slate-500">{kpi.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Ultimi Saloni Registrati */}
        <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">Ultimi Saloni Registrati</h3>
              <p className="text-xs text-slate-500">I partner che si sono uniti di recente a DogWash24.</p>
            </div>
            <Link href={"/superadmin/tenants" as Route} className="flex items-center gap-1 text-xs text-violet-400 hover:underline">
              Vedi tutti
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-800/60">
              {tenantsList.slice(0, 5).map((tenant) => {
                const ends = tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at) : null;
                const isExpired = ends ? ends < new Date() : false;
                return (
                  <div key={tenant.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-850 bg-slate-900 text-violet-400">
                        <Building className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-50">{tenant.name}</p>
                        <p className="text-xs text-slate-500">slug: <span className="font-mono text-slate-400">{tenant.slug}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        tenant.plan === "ENTERPRISE"
                          ? "bg-purple-500/15 text-purple-300 ring-purple-500/20"
                          : tenant.plan === "PRO"
                            ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20"
                            : "bg-slate-800 text-slate-400 ring-slate-700"
                      }`}>
                        {tenant.plan}
                      </span>
                      <span className={`text-xs ${isExpired ? "text-rose-400" : "text-slate-400"}`}>
                        {ends 
                          ? `Scade il ${ends.toLocaleDateString("it-IT")}` 
                          : "Senza scadenza"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {tenantsList.length === 0 && (
                <p className="text-center py-6 text-sm text-slate-500">Nessun salone registrato al momento.</p>
              )}
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
