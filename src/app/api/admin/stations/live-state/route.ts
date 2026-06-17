import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type SessionRow = Database["public"]["Tables"]["active_sessions"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Database["public"]["Tables"]["dogs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

function isAdminUser(user: any) {
  return Boolean(user && user.app_metadata && user.app_metadata.role === "admin");
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user as any;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }
  if (!isAdminUser(user)) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  // 1. Fetch stations
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("*")
    .order("created_at", { ascending: true });

  if (stationsError) {
    return Response.json({ error: stationsError.message }, { status: 400 });
  }

  // 2. Fetch active sessions
  const { data: activeSessions, error: sessionsError } = await supabase
    .from("active_sessions")
    .select("*")
    .order("activated_at", { ascending: false });

  if (sessionsError) {
    return Response.json({ error: sessionsError.message }, { status: 400 });
  }

  const liveSessions = (activeSessions ?? []) as SessionRow[];
  const bookingIds = Array.from(new Set(liveSessions.map((s) => s.booking_id).filter(Boolean))) as string[];
  const customerIds = Array.from(new Set(liveSessions.map((s) => s.customer_id))) as string[];

  // 3. Fetch bookings associated with active sessions
  let bookings: Booking[] = [];
  if (bookingIds.length > 0) {
    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select("*")
      .in("id", bookingIds);
    if (!bookingsError && bookingsData) {
      bookings = bookingsData;
    }
  }

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id))) as string[];

  // 4. Fetch dogs
  let dogs: Dog[] = [];
  if (dogIds.length > 0) {
    const { data: dogsData, error: dogsError } = await supabase
      .from("dogs")
      .select("*")
      .in("id", dogIds);
    if (!dogsError && dogsData) {
      dogs = dogsData;
    }
  }

  // 5. Fetch customer profiles
  let profiles: Profile[] = [];
  if (customerIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, phone, avatar_url, created_at")
      .in("id", customerIds);
    if (!profilesError && profilesData) {
      profiles = profilesData as Profile[];
    }
  }

  return Response.json({
    stations,
    activeSessions: liveSessions,
    bookings,
    dogs,
    profiles
  });
}
