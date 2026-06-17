import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;
  const supabase = (await createSupabaseServerClient()) as any;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  let minutes = 10;
  let costCredits = 10;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.minutes === "number") {
      minutes = body.minutes;
    }
    if (typeof body?.costCredits === "number") {
      costCredits = body.costCredits;
    }
  } catch {
    // Usa i valori di default se il body manca o è invalido
  }

  // Chiamata RPC transazionale sul DB
  const { data, error } = await supabase.rpc("extend_booking_session", {
    p_booking_id: bookingId,
    p_extension_minutes: minutes,
    p_cost_credits: costCredits
  });

  if (error) {
    let alternatives: string[] = [];
    if (error.code === "23P01" || error.message.includes("occupata")) {
      try {
        const { data: booking } = await supabase
          .from("bookings")
          .select("end_time, station_id")
          .eq("id", bookingId)
          .single();

        if (booking) {
          const startCheck = booking.end_time;
          const endCheck = new Date(new Date(booking.end_time).getTime() + minutes * 60 * 1000).toISOString();

          // Cerca le altre postazioni dello stesso tipo che sono AVAILABLE
          const { data: allStations } = await supabase
            .from("stations")
            .select("id, name")
            .eq("status", "AVAILABLE")
            .neq("id", booking.station_id);

          // Cerca se ci sono prenotazioni sovrapposte in quelle postazioni
          const { data: overlappingBookings } = await supabase
            .from("bookings")
            .select("station_id")
            .in("status", ["CONFIRMED", "PENDING"])
            .lt("start_time", endCheck)
            .gt("end_time", startCheck);

          const busyStationIds = new Set(overlappingBookings?.map((b: any) => b.station_id) ?? []);
          alternatives = (allStations ?? [])
            .filter((s: any) => !busyStationIds.has(s.id))
            .map((s: any) => s.name);
        }
      } catch (err) {
        console.error("Errore nella ricerca di postazioni alternative:", err);
      }
    }

    return Response.json({
      error: error.message,
      code: "OVERLAP_CONFLICT",
      alternatives
    }, { status: 400 });
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result || !result.extended) {
    return Response.json({ error: "Impossibile estendere la sessione." }, { status: 400 });
  }

  return Response.json({
    ok: true,
    extended: true,
    new_end_time: result.new_end_time,
    new_balance_credits: result.new_balance_credits,
    new_remaining_seconds: result.new_remaining_seconds
  });
}
