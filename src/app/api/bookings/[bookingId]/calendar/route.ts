import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function toIcsDate(value: string) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET(_: Request, context: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (!booking) {
    return Response.json({ error: "Prenotazione non trovata" }, { status: 404 });
  }

  const bookingRecord = booking as Database["public"]["Tables"]["bookings"]["Row"];
  const [{ data: dog }, { data: station }] = await Promise.all([
    supabase.from("dogs").select("name").eq("id", bookingRecord.dog_id).maybeSingle(),
    supabase.from("stations").select("name").eq("id", bookingRecord.station_id).maybeSingle()
  ]);
  const dogRecord = dog as Pick<Database["public"]["Tables"]["dogs"]["Row"], "name"> | null;
  const stationRecord = station as Pick<Database["public"]["Tables"]["stations"]["Row"], "name"> | null;

  const title = `Taglio24 - ${dogRecord?.name ?? "Prenotazione"} (${stationRecord?.name ?? "Postazione"})`;
  const description = `Prenotazione Taglio24 per ${dogRecord?.name ?? "il tuo profilo"} presso ${stationRecord?.name ?? "il salone"}.`;
  const uid = `${bookingRecord.id}@taglio24.local`;

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Taglio24//Prenotazioni//IT",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(bookingRecord.start_time)}`,
    `DTEND:${toIcsDate(bookingRecord.end_time)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(stationRecord?.name ?? "DogWash24")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="prenotazione-${bookingRecord.id}.ics"`
    }
  });
}
