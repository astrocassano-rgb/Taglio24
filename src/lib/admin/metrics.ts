import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Helper di aggregazione metriche per il pannello superadmin (claude.ai).
 *
 * NB: tutte le funzioni richiedono un client con SERVICE ROLE (createSupabaseAdminClient),
 * perché aggregano dati GLOBALI attraverso tutti i tenant bypassando la RLS.
 *
 * Scelta progettuale (vincolo: niente nuove tabelle/viste/migrazioni): le metriche per-salone
 * sono calcolate in TypeScript a partire da poche query "bulk" sulle tabelle esistenti, invece
 * che con una VIEW SQL o RPC dedicate. È adeguato per una rete di saloni di dimensioni medio-piccole.
 * Se in futuro i volumi crescono molto, conviene spostare l'aggregazione in una VIEW materializzata
 * o in una RPC SQL (richiederebbe una migrazione, da concordare).
 */

export type TenantMetrics = {
  /** Numero di clienti associati al salone (righe tenant_customers, qualunque ruolo). */
  customers: number;
  /** Numero di amministratori del salone (tenant_customers.role = 'admin'). */
  admins: number;
  /** Prenotazioni totali del salone. */
  bookings: number;
  /** Sessioni H24 attualmente attive nel salone. */
  activeSessions: number;
  /** Fatturato in euro (somma amount_currency delle transazioni CHARGE). */
  revenueEur: number;
  /** Crediti venduti (somma amount_credits delle transazioni CHARGE). */
  creditsSold: number;
};

export type TenantWithMetrics = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionEndsAt: string | null;
  createdAt: string;
  isExpired: boolean;
  /** true se la scadenza cade entro i prossimi `EXPIRING_SOON_DAYS` giorni. */
  isExpiringSoon: boolean;
  metrics: TenantMetrics;
};

export type NetworkOverview = {
  tenants: TenantWithMetrics[];
  totals: {
    tenants: number;
    activeTenants: number;
    /** Somma delle appartenenze per-salone (un utente in N saloni conta N volte). */
    customers: number;
    /** Utenti registrati UNICI a livello globale (conteggio profili). */
    uniqueCustomers: number;
    bookings: number;
    activeSessions: number;
    revenueEur: number;
    creditsSold: number;
    /** Ricavi ricorrenti mensili (MRR) stimati dai piani dei saloni attivi. */
    mrr: number;
    /** Ricavi ricorrenti semestrali stimati. */
    semiannual: number;
    /** Ricavi ricorrenti annuali (ARR) stimati. */
    arr: number;
  };
  alerts: {
    expired: TenantWithMetrics[];
    expiringSoon: TenantWithMetrics[];
    /** Saloni operativi (slug != 'default') che non hanno alcun amministratore. */
    withoutAdmin: TenantWithMetrics[];
  };
};

/** Prezzi mensili predefiniti per ciascun tipo di piano commerciale. */
export const PLAN_PRICES = {
  LIGHT: 29,
  PRO: 59,
  ENTERPRISE: 149,
} as const;

export type PlanType = keyof typeof PLAN_PRICES;

export function getPlanPrice(plan: string): number {
  const cleanPlan = (plan || "").toUpperCase();
  if (cleanPlan in PLAN_PRICES) {
    return PLAN_PRICES[cleanPlan as PlanType];
  }
  return 0;
}

/** Numero di giorni entro cui un abbonamento è considerato "in scadenza". */
export const EXPIRING_SOON_DAYS = 14;

type AdminClient = SupabaseClient<Database>;

function emptyMetrics(): TenantMetrics {
  return { customers: 0, admins: 0, bookings: 0, activeSessions: 0, revenueEur: 0, creditsSold: 0 };
}

/**
 * Costruisce la panoramica completa del network: ogni salone con le sue metriche,
 * i totali aggregati e gli alert (scaduti, in scadenza, senza admin).
 *
 * Esegue poche query bulk (una per dominio di dato) e aggrega in memoria, così il numero
 * di round-trip al DB NON cresce col numero di saloni.
 */
export async function getNetworkOverview(admin: AdminClient): Promise<NetworkOverview> {
  const now = Date.now();
  const soonThreshold = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

  const [
    tenantsRes,
    membershipsRes,
    bookingsRes,
    sessionsRes,
    chargesRes,
    profilesCountRes,
  ] = await Promise.all([
    admin.from("tenants").select("id, name, slug, plan, subscription_ends_at, created_at").order("created_at", { ascending: false }),
    admin.from("tenant_customers").select("tenant_id, role"),
    admin.from("bookings").select("tenant_id"),
    admin.from("active_sessions").select("tenant_id"),
    // Solo le transazioni di acquisto crediti concorrono al fatturato.
    admin.from("token_transactions").select("tenant_id, amount_currency, amount_credits").eq("type", "CHARGE"),
    // Utenti registrati unici (i profili sono globali nel modello account-condiviso).
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const uniqueCustomers = profilesCountRes.count ?? 0;

  const tenants = (tenantsRes.data ?? []) as Array<{
    id: string; name: string; slug: string; plan: string; subscription_ends_at: string | null; created_at: string;
  }>;

  // Mappa tenantId -> metriche, inizializzata per ogni salone esistente.
  const byTenant = new Map<string, TenantMetrics>();
  for (const t of tenants) byTenant.set(t.id, emptyMetrics());

  // Aggregazione appartenenze (clienti + admin).
  for (const m of (membershipsRes.data ?? []) as Array<{ tenant_id: string; role: string }>) {
    const metrics = byTenant.get(m.tenant_id);
    if (!metrics) continue;
    metrics.customers += 1;
    if (m.role === "admin") metrics.admins += 1;
  }

  // Aggregazione prenotazioni.
  for (const b of (bookingsRes.data ?? []) as Array<{ tenant_id: string }>) {
    const metrics = byTenant.get(b.tenant_id);
    if (metrics) metrics.bookings += 1;
  }

  // Aggregazione sessioni attive.
  for (const s of (sessionsRes.data ?? []) as Array<{ tenant_id: string }>) {
    const metrics = byTenant.get(s.tenant_id);
    if (metrics) metrics.activeSessions += 1;
  }

  // Aggregazione fatturato e crediti venduti.
  for (const c of (chargesRes.data ?? []) as Array<{ tenant_id: string; amount_currency: number | null; amount_credits: number | null }>) {
    const metrics = byTenant.get(c.tenant_id);
    if (!metrics) continue;
    metrics.revenueEur += Number(c.amount_currency ?? 0);
    metrics.creditsSold += Number(c.amount_credits ?? 0);
  }

  const tenantsWithMetrics: TenantWithMetrics[] = tenants.map((t) => {
    const ends = t.subscription_ends_at ? new Date(t.subscription_ends_at).getTime() : null;
    const isExpired = ends !== null ? ends < now : false;
    const isExpiringSoon = ends !== null ? !isExpired && ends <= soonThreshold : false;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      subscriptionEndsAt: t.subscription_ends_at,
      createdAt: t.created_at,
      isExpired,
      isExpiringSoon,
      metrics: byTenant.get(t.id) ?? emptyMetrics(),
    };
  });

  // Calcolo MRR (Fatturato Ricorrente Mensile) dai piani dei saloni attivi (non scaduti e non di default)
  let mrr = 0;
  for (const t of tenantsWithMetrics) {
    if (!t.isExpired && t.slug !== "default") {
      mrr += getPlanPrice(t.plan);
    }
  }

  const totals = tenantsWithMetrics.reduce(
    (acc, t) => {
      acc.customers += t.metrics.customers;
      acc.bookings += t.metrics.bookings;
      acc.activeSessions += t.metrics.activeSessions;
      acc.revenueEur += t.metrics.revenueEur;
      acc.creditsSold += t.metrics.creditsSold;
      if (!t.isExpired) acc.activeTenants += 1;
      return acc;
    },
    {
      tenants: tenantsWithMetrics.length,
      activeTenants: 0,
      customers: 0,
      uniqueCustomers,
      bookings: 0,
      activeSessions: 0,
      revenueEur: 0,
      creditsSold: 0,
      mrr,
      semiannual: mrr * 6,
      arr: mrr * 12,
    }
  );

  const alerts = {
    expired: tenantsWithMetrics.filter((t) => t.isExpired),
    expiringSoon: tenantsWithMetrics.filter((t) => t.isExpiringSoon),
    // Il salone "default" è tecnico (dati storici): non lo segnaliamo come "senza admin".
    withoutAdmin: tenantsWithMetrics.filter((t) => t.slug !== "default" && t.metrics.admins === 0),
  };

  return { tenants: tenantsWithMetrics, totals, alerts };
}
