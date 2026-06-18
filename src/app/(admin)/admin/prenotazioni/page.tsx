import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Database } from "@/types/database";
import { SmartAgenda } from "@/components/admin/smart-agenda";
import { format, parseISO } from "date-fns";

type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

function StatusBadge({ status }: { status: string }) {
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

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Pick<Database["public"]["Tables"]["dogs"]["Row"], "id" | "name">;
type Station = Pick<Database["public"]["Tables"]["stations"]["Row"], "id" | "name" | "type">;
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "email" | "first_name" | "last_name">;

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcIsoStart(day: string) {
  return `${day}T00:00:00.000Z`;
}

function toUtcIsoNextDayStart(day: string) {
  const [y, m, d] = day.split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0)).toISOString();
}

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type StatusFilter = "NOT_CANCELLED" | "ALL" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export default async function AdminPrenotazioniPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {};
  
  // Get active date parameter (default is today)
  const dateRaw = typeof params.date === "string" ? params.date : format(new Date(), "yyyy-MM-dd");
  
  // Parse date and calculate start/end of its week
  const activeDate = parseISO(dateRaw.includes("T") ? dateRaw : `${dateRaw}T12:00:00`);
  const dayOfWeek = activeDate.getDay();
  const diffToMonday = activeDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const activeMonday = new Date(activeDate.getTime());
  activeMonday.setDate(diffToMonday);
  
  const activeSunday = new Date(activeMonday.getTime());
  activeSunday.setDate(activeMonday.getDate() + 6);

  const defaultFrom = format(activeMonday, "yyyy-MM-dd");
  const defaultTo = format(activeSunday, "yyyy-MM-dd");

  const fromRaw = typeof params.from === "string" ? params.from : defaultFrom;
  const toRaw = typeof params.to === "string" ? params.to : defaultTo;
  
  const statusRaw = typeof params.status === "string" ? params.status : "NOT_CANCELLED";
  const status = (["NOT_CANCELLED", "ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].includes(statusRaw)
    ? statusRaw
    : "NOT_CANCELLED") as StatusFilter;



  const { supabase } = await requireAdmin({ next: "/admin/prenotazioni", mode: "notFound" });

    let query = supabase
    .from("bookings")
    .select("id, customer_id, dog_id, station_id, start_time, end_time, status, total_credits, created_at, service_type")
    .order("start_time", { ascending: false });

  if (fromRaw && isIsoDay(fromRaw)) {
    query = query.gte("start_time", toUtcIsoStart(fromRaw));
  }

  if (toRaw && isIsoDay(toRaw)) {
    const nextStart = toUtcIsoNextDayStart(toRaw);
    if (nextStart) query = query.lt("start_time", nextStart);
  }

  if (status === "NOT_CANCELLED") {
    query = query.neq("status", "CANCELLED" as any);
  } else if (status !== "ALL") {
    query = query.eq("status", status as any);
  }

  const { data: bookings } = await query.limit(200);

  const rows = (bookings ?? []) as Booking[];
  const dogIds = Array.from(new Set(rows.map((b) => b.dog_id))).filter(Boolean);
  const stationIds = Array.from(new Set(rows.map((b) => b.station_id))).filter(Boolean);
  const customerIds = Array.from(new Set(rows.map((b) => b.customer_id))).filter(Boolean);

  const [{ data: allDogsAny }, { data: stationsAny }, { data: allProfilesAny }, { data: settingsAny }] = await Promise.all([
    supabase.from("dogs").select("id, name, owner_id"),
    supabase.from("stations").select("id, name, type"),
    supabase.from("profiles").select("id, email, first_name, last_name"),
    supabase.from("system_settings").select("*").eq("id", 1).single()
  ]);

  const allDogs = allDogsAny as any[];
  const stations = stationsAny as any[];
  const allProfiles = allProfilesAny as any[];
  const settings = settingsAny as any;

  const dogNameById: Record<string, string> = {};
  for (const d of (allDogs ?? [])) dogNameById[d.id] = d.name;

  const stationById: Record<string, { name: string; type: string }> = {};
  for (const s of (stations ?? []) as Station[]) stationById[s.id] = { name: s.name, type: s.type };

  const customerById: Record<string, string> = {};
  for (const p of (allProfiles ?? [])) {
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    customerById[p.id] = fullName || p.email || p.id;
  }



  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Prenotazioni</h2>
          <p className="text-sm leading-relaxed text-slate-400">Filtrate e gestisci le prenotazioni dei clienti.</p>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-slate-700">
            {rows.length} risultati
          </span>
        )}
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-slate-300">Filtri</p>
          <p className="text-lg font-semibold tracking-tight">Cerca prenotazioni</p>
        </CardHeader>
        <CardContent>
          <form action="/admin/prenotazioni" method="get" className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="from" className="text-sm font-medium text-slate-200">
                Da
              </label>
              <Input id="from" name="from" type="date" defaultValue={fromRaw} className="h-11" />
            </div>
            <div className="space-y-2">
              <label htmlFor="to" className="text-sm font-medium text-slate-200">
                A
              </label>
              <Input id="to" name="to" type="date" defaultValue={toRaw} className="h-11" />
            </div>
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium text-slate-200">
                Stato
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status}
                className="h-11 w-full rounded-xl bg-slate-950/40 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <option value="NOT_CANCELLED">Attive (escluse annullate)</option>
                <option value="ALL">Tutte le prenotazioni</option>
                <option value="CONFIRMED">Confermate</option>
                <option value="PENDING">In attesa</option>
                <option value="COMPLETED">Completate</option>
                <option value="CANCELLED">Annullate</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 self-end">
              <Button type="submit" variant="primary" className="w-full">
                Applica
              </Button>
              <Link href="/admin/prenotazioni" className="w-full">
                <Button type="button" variant="secondary" className="w-full">
                  Reset
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {rows.length ? (
        <div className="h-[800px] mt-6">
          <SmartAgenda
            bookings={rows}
            stations={stations ?? []}
            dogNames={dogNameById}
            customerNames={customerById}
            allDogs={allDogs ?? []}
            allProfiles={allProfiles ?? []}
            maxConcurrentAssisted={settings?.max_concurrent_assisted ?? 1}
            selectedDateStr={dateRaw}
          />
        </div>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Vuoto</p>
            <p className="text-lg font-semibold tracking-tight">Nessuna prenotazione</p>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">Quando i clienti prenotano, qui compariranno le ultime 50 prenotazioni.</CardContent>
        </Card>
      )}
    </div>
  );
}
