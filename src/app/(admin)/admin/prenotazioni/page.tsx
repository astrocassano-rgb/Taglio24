import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Database } from "@/types/database";

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
  const fromRaw = typeof params.from === "string" ? params.from : "";
  const toRaw = typeof params.to === "string" ? params.to : "";
  const statusRaw = typeof params.status === "string" ? params.status : "NOT_CANCELLED";
  const status = (["NOT_CANCELLED", "ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].includes(statusRaw)
    ? statusRaw
    : "NOT_CANCELLED") as StatusFilter;

  // #region debug-point A:filters-normalized
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-bookings-filter-500", runId: "pre-fix", hypothesisId: "A", location: "src/app/(admin)/admin/prenotazioni/page.tsx", msg: "[DEBUG] Admin bookings filters normalized", data: { params, fromRaw, toRaw, statusRaw, status }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  const { supabase } = await requireAdmin({ next: "/admin/prenotazioni", mode: "notFound" });

  let query = supabase
    .from("bookings")
    .select("id, customer_id, dog_id, station_id, start_time, end_time, status, total_credits, created_at, assisted")
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

  // #region debug-point B:query-ready
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-bookings-filter-500", runId: "pre-fix", hypothesisId: "B", location: "src/app/(admin)/admin/prenotazioni/page.tsx", msg: "[DEBUG] Admin bookings query ready", data: { fromRaw, toRaw, status }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  const { data: bookings, error: bookingsError } = await query.limit(200);
  // #region debug-point C:query-result
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-bookings-filter-500", runId: "pre-fix", hypothesisId: "C", location: "src/app/(admin)/admin/prenotazioni/page.tsx", msg: "[DEBUG] Admin bookings query result", data: { status, count: bookings?.length ?? 0, error: bookingsError?.message ?? null }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  const rows = (bookings ?? []) as Booking[];
  const dogIds = Array.from(new Set(rows.map((b) => b.dog_id))).filter(Boolean);
  const stationIds = Array.from(new Set(rows.map((b) => b.station_id))).filter(Boolean);
  const customerIds = Array.from(new Set(rows.map((b) => b.customer_id))).filter(Boolean);

  const [{ data: dogs }, { data: stations }, { data: profiles }] = await Promise.all([
    dogIds.length ? supabase.from("dogs").select("id, name").in("id", dogIds) : Promise.resolve({ data: [] as Dog[] }),
    stationIds.length ? supabase.from("stations").select("id, name, type").in("id", stationIds) : Promise.resolve({ data: [] as Station[] }),
    customerIds.length ? supabase.from("profiles").select("id, email, first_name, last_name").in("id", customerIds) : Promise.resolve({ data: [] as Profile[] })
  ]);

  const dogNameById: Record<string, string> = {};
  for (const d of (dogs ?? []) as Dog[]) dogNameById[d.id] = d.name;

  const stationById: Record<string, { name: string; type: string }> = {};
  for (const s of (stations ?? []) as Station[]) stationById[s.id] = { name: s.name, type: s.type };

  const customerById: Record<string, string> = {};
  for (const p of (profiles ?? []) as Profile[]) {
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    customerById[p.id] = fullName || p.email || p.id;
  }

  // #region debug-point D:render-ready
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-bookings-filter-500", runId: "pre-fix", hypothesisId: "D", location: "src/app/(admin)/admin/prenotazioni/page.tsx", msg: "[DEBUG] Admin bookings render ready", data: { rows: rows.length }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Prenotazioni</h2>
        <p className="text-sm leading-relaxed text-slate-200">Elenco rapido delle ultime prenotazioni e azioni admin.</p>
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
                <option value="NOT_CANCELLED">Tutte (escludi annullate)</option>
                <option value="ALL">Tutte (incluse annullate)</option>
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
        <div className="grid gap-3">
          {rows.map((b) => {
            const start = new Date(b.start_time);
            const end = new Date(b.end_time);
            const station = stationById[b.station_id]?.name ?? "Postazione";
            const dog = dogNameById[b.dog_id] ?? "Cane";
            const customer = customerById[b.customer_id] ?? "Cliente";
            const timeLabel = `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`;

            return (
              <Card key={b.id} className="overflow-hidden">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-50">{timeLabel}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                        <span>{station}</span>
                        <span>·</span>
                        <span>{dog}</span>
                        <span>·</span>
                        <span>{customer}</span>
                        {b.assisted && (
                          <span className="rounded bg-blue-500/15 text-blue-200 px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset ring-blue-500/20">
                            Assistito
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">Stato: {b.status} · {b.total_credits} crediti</p>
                    </div>
                    <Link href={`/prenotazioni/${b.id}`} className="shrink-0">
                      <Button variant="secondary">Dettagli</Button>
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <form action="/api/admin/bookings/status" method="post" className="contents">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="status" value="CONFIRMED" />
                      <Button className="w-full" variant="secondary" type="submit" disabled={b.status !== "PENDING"}>
                        Conferma
                      </Button>
                    </form>
                    <form action="/api/admin/bookings/status" method="post" className="contents">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="status" value="COMPLETED" />
                      <Button className="w-full" variant="secondary" type="submit" disabled={b.status === "CANCELLED" || b.status === "COMPLETED"}>
                        Completa
                      </Button>
                    </form>
                    <form action="/api/admin/bookings/status" method="post" className="contents">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="status" value="CANCELLED" />
                      <Button className="w-full" variant="primary" type="submit" disabled={b.status === "CANCELLED" || b.status === "COMPLETED"}>
                        Annulla (rimborsa)
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
