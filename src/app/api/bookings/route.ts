import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// POST /api/bookings — alternativa a RPC create_booking
// Workaround per il bug "column reference total_credits is ambiguous"
// nella funzione PostgreSQL create_booking (migrations 0015-0019).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { p_station_id, p_dog_id, p_start_time, p_end_time, p_service_type = "SELF_SERVICE" } = body;

    if (!p_station_id || !p_dog_id || !p_start_time || !p_end_time) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    // ① Ottieni utente autenticato dalla sessione cookie
    const supabaseUser = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const userId = user.id;

    // ② Client admin: legge process.env DIRETTAMENTE (evita cache getEnv())
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[/api/bookings] Variabili Supabase mancanti:", { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey });
      return NextResponse.json({ error: "Configurazione server incompleta" }, { status: 500 });
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });


    const startTime = new Date(p_start_time);
    const endTime = new Date(p_end_time);

    if (endTime <= startTime) {
      return NextResponse.json({ error: "Intervallo orario non valido" }, { status: 400 });
    }

    // ③ Verifica postazione
    const { data: station, error: stationErr } = await admin
      .from("stations")
      .select("id, cost_per_minute, status")
      .eq("id", p_station_id)
      .single();

    if (stationErr || !station) {
      return NextResponse.json({ error: "Postazione non trovata" }, { status: 400 });
    }
    if (station.status === "MAINTENANCE") {
      return NextResponse.json({ error: "Postazione in manutenzione" }, { status: 400 });
    }

    // ④ Verifica cane appartiene all'utente
    const { data: dog, error: dogErr } = await admin
      .from("dogs")
      .select("id, name")
      .eq("id", p_dog_id)
      .eq("owner_id", userId)
      .maybeSingle();

    if (dogErr || !dog) {
      return NextResponse.json({ error: "Cane non valido" }, { status: 400 });
    }

    // ⑤ Check overlap anti-overbooking (vede TUTTE le prenotazioni grazie a service_role)
    const { data: overlap } = await admin
      .from("bookings")
      .select("id")
      .eq("station_id", p_station_id)
      .in("status", ["PENDING", "CONFIRMED"])
      .lt("start_time", p_end_time)
      .gt("end_time", p_start_time)
      .limit(1);

    if (overlap && overlap.length > 0) {
      return NextResponse.json(
        { error: "Slot non disponibile: postazione già occupata in questo intervallo" },
        { status: 409 }
      );
    }

    // ⑥ Leggi system settings per servizi extra
    const { data: settings } = await admin
      .from("system_settings")
      .select("enable_assisted_wash, price_assisted_wash_credits, enable_full_grooming, price_full_grooming_credits")
      .eq("id", 1)
      .maybeSingle();

    let operatorCost = 0;
    if (p_service_type === "ASSISTED_WASH") {
      if (!settings?.enable_assisted_wash) {
        return NextResponse.json({ error: "Servizio Lavaggio Assistito non disponibile" }, { status: 400 });
      }
      operatorCost = settings.price_assisted_wash_credits ?? 0;
    } else if (p_service_type === "FULL_GROOMING") {
      if (!settings?.enable_full_grooming) {
        return NextResponse.json({ error: "Servizio Toelettatura Completa non disponibile" }, { status: 400 });
      }
      operatorCost = settings.price_full_grooming_credits ?? 0;
    }

    // ⑦ Calcolo costo totale
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.max(1, Math.ceil(durationMs / 60000));
    const stationCost = Math.round(station.cost_per_minute * durationMinutes * 100) / 100;
    const totalCredits = stationCost + operatorCost;

    // ⑧ Leggi e verifica wallet
    const { data: wallet, error: walletErr } = await admin
      .from("wallets")
      .select("id, balance_credits")
      .eq("customer_id", userId)
      .maybeSingle();

    if (walletErr || !wallet) {
      return NextResponse.json({ error: "Wallet non trovato" }, { status: 400 });
    }
    if (wallet.balance_credits < totalCredits) {
      return NextResponse.json({ error: "Crediti insufficienti" }, { status: 400 });
    }

    // ⑨ Scala wallet
    const newBalance = Math.round((wallet.balance_credits - totalCredits) * 100) / 100;
    const { error: walletUpdateErr } = await admin
      .from("wallets")
      .update({ balance_credits: newBalance })
      .eq("id", wallet.id);

    if (walletUpdateErr) {
      return NextResponse.json({ error: "Errore aggiornamento wallet" }, { status: 500 });
    }

    // ⑩ Inserisce booking
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .insert({
        customer_id: userId,
        dog_id: p_dog_id,
        station_id: p_station_id,
        start_time: p_start_time,
        end_time: p_end_time,
        status: "CONFIRMED",
        total_credits: totalCredits,
        service_type: p_service_type,
        operator_cost_credits: operatorCost,
      })
      .select("id, status, total_credits")
      .single();

    if (bookingErr || !booking) {
      // Rollback: ripristina wallet
      await admin
        .from("wallets")
        .update({ balance_credits: wallet.balance_credits })
        .eq("id", wallet.id);

      // Se è exclusion violation, slot già preso
      if (bookingErr?.code === "23P01") {
        return NextResponse.json(
          { error: "Slot non disponibile: prenotazione già esistente" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: bookingErr?.message ?? "Errore inserimento booking" }, { status: 500 });
    }

    // ⑪ Registra transazione wallet
    await admin.from("token_transactions").insert({
      wallet_id: wallet.id,
      type: "DEBIT",
      amount_credits: totalCredits,
      amount_currency: 0,
      stripe_intent_id: null,
      note:
        p_service_type === "ASSISTED_WASH"
          ? "Prenotazione Lavaggio Assistito"
          : p_service_type === "FULL_GROOMING"
          ? "Prenotazione Toelettatura Completa"
          : "Prenotazione self-service",
    });

    // ⑫ Risposta identica all'RPC (array con un elemento)
    return NextResponse.json(
      [{ booking_id: booking.id, total_credits: booking.total_credits, status: booking.status }],
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[POST /api/bookings]", err);
    return NextResponse.json({ error: err?.message ?? "Errore interno" }, { status: 500 });
  }
}
