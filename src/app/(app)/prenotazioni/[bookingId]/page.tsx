import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, Clock3, CreditCard, PawPrint } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SERVICE_LABELS, createGoogleCalendarUrl, type StationType } from "@/lib/booking-planner";
import { isSessionLive } from "@/lib/active-sessions";
import { buildCheckinQrValue, signCheckinToken } from "@/lib/checkin-token";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { BookingSessionCard } from "./booking-session-card";
import { CancelBookingCard } from "./cancel-booking-card";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Pick<Database["public"]["Tables"]["dogs"]["Row"], "name">;
type Station = Pick<Database["public"]["Tables"]["stations"]["Row"], "name" | "type">;
type ActiveSession = Database["public"]["Tables"]["active_sessions"]["Row"];

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatStatus(value: Booking["status"]) {
  if (value === "CONFIRMED") return { label: "Confermata", tone: "emerald" } as const;
  if (value === "PENDING") return { label: "In attesa", tone: "amber" } as const;
  if (value === "CANCELLED") return { label: "Annullata", tone: "rose" } as const;
  return { label: value, tone: "slate" } as const;
}

export default async function PrenotazioneDettaglioPage({
  params,
  searchParams
}: {
  params: Promise<{ bookingId: string }>;
  searchParams?: Promise<{ cancelled?: string; refund?: string }>;
}) {
  const { bookingId } = await params;
  const query = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/prenotazioni/${bookingId}`)}`);
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (!booking) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Prenotazione</h2>
          <p className="text-sm leading-relaxed text-slate-200">Non troviamo questa prenotazione nel tuo account.</p>
        </header>
        <Link href="/">
          <Button variant="secondary" className="w-full">
            <ChevronLeft className="h-5 w-5" />
            Torna alla dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const bookingRecord = booking as Booking;
  const [{ data: dog }, { data: station }, { data: activeSessions }] = await Promise.all([
    supabase.from("dogs").select("name").eq("id", bookingRecord.dog_id).maybeSingle(),
    supabase.from("stations").select("name, type").eq("id", bookingRecord.station_id).maybeSingle(),
    supabase.from("active_sessions").select("*").eq("booking_id", bookingRecord.id).order("activated_at", { ascending: false }).limit(5)
  ]);

  const dogRecord = dog as Dog | null;
  const stationRecord = station as Station | null;
  const activeSessionRecord = ((activeSessions ?? []) as ActiveSession[]).find((session) => isSessionLive(session)) ?? null;

  const start = new Date(bookingRecord.start_time);
  const end = new Date(bookingRecord.end_time);
  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const status = formatStatus(bookingRecord.status);
  const stationType = (stationRecord?.type ?? null) as StationType | null;
  const serviceLabel = stationType ? SERVICE_LABELS[stationType] : "Servizio";

  const statusTone =
    status.tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
      : status.tone === "amber"
        ? "bg-amber-500/15 text-amber-200 ring-amber-500/30"
        : status.tone === "rose"
          ? "bg-rose-500/15 text-rose-200 ring-rose-500/30"
          : "bg-slate-500/15 text-slate-200 ring-slate-500/30";

  const stationName = stationRecord?.name ?? "Postazione";
  const dogName = dogRecord?.name ?? "Cane";
  const canCancel = bookingRecord.status === "PENDING" || bookingRecord.status === "CONFIRMED";
  const hasStarted = start.getTime() <= new Date().getTime();
  const showCancel = canCancel && !hasStarted;
  const showSessionCard = bookingRecord.status === "CONFIRMED" || bookingRecord.status === "PENDING";
  const liveSession = activeSessionRecord && isSessionLive(activeSessionRecord) ? activeSessionRecord : null;
  const checkinQrValue = buildCheckinQrValue(
    signCheckinToken({
      v: 1,
      booking_id: bookingRecord.id,
      customer_id: bookingRecord.customer_id,
      station_id: bookingRecord.station_id,
      valid_from: bookingRecord.start_time,
      valid_until: bookingRecord.end_time
    })
  );
  const cancelMessage =
    query.cancelled === "1"
      ? query.refund
        ? `Prenotazione annullata. Rimborso: ${query.refund} crediti.`
        : "Prenotazione annullata. Nessun rimborso previsto."
      : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/">
          <Button variant="ghost" className="px-0">
            <ChevronLeft className="h-5 w-5" />
            Dashboard
          </Button>
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight">Dettaglio prenotazione</h2>
        <p className="text-sm leading-relaxed text-slate-200">Qui trovi tutto il riepilogo e le azioni per il calendario.</p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-300">Riepilogo</p>
            <div className="flex items-center gap-2">
              {bookingRecord.service_type === "ASSISTED_WASH" && (
                <span className="rounded bg-blue-500/15 text-blue-200 px-2 py-0.5 text-xs font-bold ring-1 ring-inset ring-blue-500/20">
                  Lavaggio Assistito
                </span>
              )}
              {bookingRecord.service_type === "FULL_GROOMING" && (
                <span className="rounded bg-fuchsia-500/15 text-fuchsia-200 px-2 py-0.5 text-xs font-bold ring-1 ring-inset ring-fuchsia-500/20">
                  Toelettatura Completa
                </span>
              )}
              <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusTone}`}>{status.label}</span>
            </div>
          </div>
          <p className="text-lg font-semibold tracking-tight">{formatDay(start)}</p>
          <p className="text-sm text-slate-300">
            {formatTime(start)}–{formatTime(end)} · {durationMinutes} min
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {cancelMessage ? (
            <div className="rounded-3xl bg-slate-950/40 p-4 text-sm text-slate-100 ring-1 ring-inset ring-slate-800">
              {cancelMessage}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <div className="flex items-center gap-3">
                <PawPrint className="h-5 w-5 text-slate-200" />
                <div>
                  <p className="text-sm text-slate-300">Cane</p>
                  <p className="text-base font-semibold text-slate-50">{dogName}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-slate-200" />
                <div>
                  <p className="text-sm text-slate-300">Servizio</p>
                  <p className="text-base font-semibold text-slate-50">
                    {serviceLabel} · {stationName}
                  </p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                    {bookingRecord.service_type === "FULL_GROOMING" ? "Toelettatura Completa" : bookingRecord.service_type === "ASSISTED_WASH" ? "Lavaggio Assistito" : "Self-Service"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <div className="flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-slate-200" />
                <div>
                  <p className="text-sm text-slate-300">Durata</p>
                  <p className="text-base font-semibold text-slate-50">{durationMinutes} minuti</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-slate-200" />
                <div>
                  <p className="text-sm text-slate-300">Costo</p>
                  <p className="text-base font-semibold text-slate-50">{bookingRecord.total_credits} crediti</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={createGoogleCalendarUrl({
                title: `DogWash24 - ${dogName}`,
                details: `${stationName} · Prenotazione DogWash24 per ${dogName}`,
                location: stationName,
                startIso: bookingRecord.start_time,
                endIso: bookingRecord.end_time
              })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900/70 px-4 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
            >
              Apri in Google Calendar
            </a>
            <a
              href={`/api/bookings/${bookingRecord.id}/calendar`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900/70 px-4 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
            >
              Scarica file .ics
            </a>
          </div>

          {showCancel ? <CancelBookingCard bookingId={bookingRecord.id} startIso={bookingRecord.start_time} totalCredits={bookingRecord.total_credits} /> : null}
        </CardContent>
      </Card>

      {showSessionCard ? (
        <BookingSessionCard
          bookingId={bookingRecord.id}
          startIso={bookingRecord.start_time}
          endIso={bookingRecord.end_time}
          stationName={stationName}
          checkinQrValue={checkinQrValue}
          activeSession={
            liveSession
              ? {
                  id: liveSession.id,
                  activated_at: liveSession.activated_at,
                  remaining_seconds: liveSession.remaining_seconds
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}
