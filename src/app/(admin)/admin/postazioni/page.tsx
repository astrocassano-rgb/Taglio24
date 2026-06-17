import { requireAdmin } from "@/lib/auth/require-admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StationLayoutEditor } from "./station-layout-editor";
import { MappaLiveClient } from "./mappa-live-client";
import type { Database } from "@/types/database";
import Link from "next/link";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type SessionRow = Database["public"]["Tables"]["active_sessions"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Database["public"]["Tables"]["dogs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const dynamic = "force-dynamic";

export default async function AdminPostazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const { supabase } = await requireAdmin({ next: "/admin/postazioni", mode: "notFound" });

  const activeTab = tab || "live";

  // 1. Fetch stations
  const { data: stationsData } = await supabase.from("stations").select("*").order("created_at", { ascending: true });
  const stations = (stationsData ?? []) as Station[];

  // 2. Fetch active sessions
  const { data: sessionsData } = await supabase.from("active_sessions").select("*").order("activated_at", { ascending: false });
  const activeSessions = (sessionsData ?? []) as SessionRow[];

  const bookingIds = Array.from(new Set(activeSessions.map((s) => s.booking_id).filter(Boolean))) as string[];
  const customerIds = Array.from(new Set(activeSessions.map((s) => s.customer_id))) as string[];

  // 3. Fetch bookings associated with active sessions
  let bookings: Booking[] = [];
  if (bookingIds.length > 0) {
    const { data: bookingsData } = await supabase.from("bookings").select("*").in("id", bookingIds);
    if (bookingsData) bookings = bookingsData;
  }

  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id))) as string[];

  // 4. Fetch dogs
  let dogs: Dog[] = [];
  if (dogIds.length > 0) {
    const { data: dogsData } = await supabase.from("dogs").select("*").in("id", dogIds);
    if (dogsData) dogs = dogsData;
  }

  // 5. Fetch profiles
  let profiles: Profile[] = [];
  if (customerIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, phone, avatar_url, created_at")
      .in("id", customerIds);
    if (profilesData) profiles = profilesData as Profile[];
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Postazioni</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Monitoraggio in tempo reale, gestione del layout e tariffe della struttura.
          </p>
        </div>

        {/* Tab switcher styled with Apple feel */}
        <div className="inline-flex self-start rounded-full bg-slate-900/60 p-1 ring-1 ring-inset ring-slate-800/80 backdrop-blur-md">
          <Link
            href="/admin/postazioni?tab=live"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "live"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Mappa Live 24H
          </Link>
          <Link
            href="/admin/postazioni?tab=editor"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "editor"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Editor Layout & Tariffe
          </Link>
        </div>
      </header>

      {!stations.length ? (
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Vuoto</p>
            <p className="text-lg font-semibold tracking-tight">Nessuna postazione</p>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            Crea postazioni in Supabase per iniziare.
          </CardContent>
        </Card>
      ) : activeTab === "live" ? (
        <MappaLiveClient
          initialStations={stations}
          initialActiveSessions={activeSessions}
          initialBookings={bookings}
          initialDogs={dogs}
          initialProfiles={profiles}
        />
      ) : (
        <StationLayoutEditor initialStations={stations} />
      )}
    </div>
  );
}
