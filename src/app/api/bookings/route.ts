// @ts-nocheck
/* eslint-disable */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";


// POST /api/bookings — workaround per "column reference total_credits is ambiguous"
// nella funzione RPC create_booking.
//
// Usa il client AUTENTICATO dell'utente (anon key + JWT) senza bisogno
// del service_role key. Il check overlap usa get_booking_availability
// (SECURITY DEFINER con row_security=OFF) che già vede tutte le prenotazioni.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      p_station_id,
      p_dog_id,
      p_start_time,
      p_end_time,
      p_service_type = "SELF_SERVICE",
      p_service_id,
    } = body;

    if (!p_station_id || !p_dog_id || !p_start_time || !p_end_time) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    // ① Client autenticato (anon key + cookie sessione utente)
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const userId = user.id;

    // Recupera il tenant_id dell'utente
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id || "00000000-0000-0000-0000-000000000000";

    const startTime = new Date(p_start_time);
    const endTime = new Date(p_end_time);

    if (endTime <= startTime) {
      return NextResponse.json({ error: "Intervallo orario non valido" }, { status: 400 });
    }

    // ② Check overlap usando get_booking_availability
    // (SECURITY DEFINER + row_security=OFF → vede prenotazioni di TUTTI)
    const { data: occupiedRaw, error: availErr } = await supabase.rpc(
      "get_booking_availability",
      {
        p_from: p_start_time as string,
        p_to: p_end_time as string,
        p_tenant_id: tenantId,
      }
    );

    if (availErr) {
      console.error("[/api/bookings] Errore availability:", availErr);
      return NextResponse.json(
        { error: "Errore verifica disponibilità" },
        { status: 500 }
      );
    }

    const occupied = occupiedRaw as Array<{ station_id: string; start_time: string; end_time: string }> | null;
    // Filtra per la postazione richiesta
    const conflict = occupied?.find((slot) => slot.station_id === p_station_id);
    if (conflict) {
      return NextResponse.json(
        { error: "Slot non disponibile: postazione già occupata in questo intervallo" },
        { status: 409 }
      );
    }

    // ③ Verifica postazione
    const { data: stationRaw, error: stationErr } = await supabase
      .from("stations")
      .select("id, cost_per_minute, status")
      .eq("id", p_station_id)
      .eq("tenant_id", tenantId)
      .single();
    const station = stationRaw as { id: string; cost_per_minute: number; status: string } | null;

    if (stationErr || !station) {
      return NextResponse.json({ error: "Postazione non trovata" }, { status: 400 });
    }
    if (station.status === "MAINTENANCE") {
      return NextResponse.json({ error: "Postazione in manutenzione" }, { status: 400 });
    }

    // ④ Verifica cane appartiene all'utente
    const { data: dog, error: dogErr } = await supabase
      .from("dogs")
      .select("id, name")
      .eq("id", p_dog_id)
      .eq("owner_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (dogErr || !dog) {
      return NextResponse.json({ error: "Cane non valido" }, { status: 400 });
    }

    // ⑤ Determina il servizio e i costi associati
    let serviceId = p_service_id;
    let serviceType = p_service_type;
    let operatorCost = 0;
    let finalCostPerMinute = station.cost_per_minute;
    let serviceName = "Servizio";

    if (serviceId) {
      const { data: service, error: serviceErr } = await supabase
        .from("services")
        .select("id, name, booking_type, fixed_cost_credits, cost_per_minute_credits, is_active")
        .eq("id", serviceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (serviceErr || !service) {
        return NextResponse.json({ error: "Servizio non trovato" }, { status: 400 });
      }
      if (!service.is_active) {
        return NextResponse.json({ error: "Servizio al momento non attivo" }, { status: 400 });
      }

      serviceType = service.booking_type;
      operatorCost = Number(service.fixed_cost_credits) || 0;
      serviceName = service.name;
      if (Number(service.cost_per_minute_credits) > 0) {
        finalCostPerMinute = Number(service.cost_per_minute_credits);
      }
    } else {
      // Fallback per vecchie integrazioni o inserimenti admin manuali:
      // Cerchiamo il servizio attivo di default per questa categoria per questo tenant
      const { data: fallbackService } = await supabase
        .from("services")
        .select("id, name, fixed_cost_credits, cost_per_minute_credits")
        .eq("tenant_id", tenantId)
        .eq("booking_type", p_service_type)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackService) {
        serviceId = fallbackService.id;
        serviceName = fallbackService.name;
        operatorCost = Number(fallbackService.fixed_cost_credits) || 0;
        if (Number(fallbackService.cost_per_minute_credits) > 0) {
          finalCostPerMinute = Number(fallbackService.cost_per_minute_credits);
        }
      } else {
        // Fallback assoluto ai vecchi system settings
        const { data: settingsRaw } = await supabase
          .from("system_settings")
          .select("enable_assisted_wash, price_assisted_wash_credits, enable_full_grooming, price_full_grooming_credits")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const settings = settingsRaw as any;
        if (p_service_type === "ASSISTED_WASH") {
          if (!settings?.enable_assisted_wash) {
            return NextResponse.json({ error: "Servizio Lavaggio Assistito non disponibile" }, { status: 400 });
          }
          operatorCost = settings.price_assisted_wash_credits ?? 0;
          serviceName = "Lavaggio Assistito";
        } else if (p_service_type === "FULL_GROOMING") {
          if (!settings?.enable_full_grooming) {
            return NextResponse.json({ error: "Servizio Toelettatura Completa non disponibile" }, { status: 400 });
          }
          operatorCost = settings.price_full_grooming_credits ?? 0;
          serviceName = "Toelettatura Completa";
        } else {
          serviceName = "Self-Service";
        }
      }
    }

    if (!serviceId) {
      // Last-ditch recovery to satisfy NOT NULL constraint
      const { data: selfService } = await supabase
        .from("services")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", "Self-Service")
        .maybeSingle();
      if (selfService) {
        serviceId = selfService.id;
      }
    }

    // ⑥ Calcolo costo totale
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.max(1, Math.ceil(durationMs / 60000));
    const stationCost = Math.round(finalCostPerMinute * durationMinutes * 100) / 100;
    const totalCredits = stationCost + operatorCost;

    // ⑦ Leggi wallet
    const { data: walletRaw, error: walletErr } = await supabase
      .from("wallets")
      .select("id, balance_credits")
      .eq("customer_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const wallet = walletRaw as { id: string; balance_credits: number } | null;

    if (walletErr || !wallet) {
      return NextResponse.json({ error: "Wallet non trovato" }, { status: 400 });
    }
    if (wallet.balance_credits < totalCredits) {
      return NextResponse.json({ error: "Crediti insufficienti" }, { status: 400 });
    }

    // ⑧ Scala wallet
    const newBalance = Math.round((wallet.balance_credits - totalCredits) * 100) / 100;
    const { error: walletUpdateErr } = await supabase
      .from("wallets")
      .update({ balance_credits: newBalance })
      .eq("id", wallet.id);

    if (walletUpdateErr) {
      console.error("[/api/bookings] Errore wallet update:", walletUpdateErr);
      return NextResponse.json({ error: "Errore aggiornamento wallet" }, { status: 500 });
    }

    // ⑨ Inserisce booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        customer_id: userId,
        dog_id: p_dog_id,
        station_id: p_station_id,
        start_time: p_start_time,
        end_time: p_end_time,
        status: "CONFIRMED",
        total_credits: totalCredits,
        service_type: serviceType,
        operator_cost_credits: operatorCost,
        tenant_id: tenantId,
        service_id: serviceId,
      })
      .select("id, status, total_credits")
      .single();

    if (bookingErr || !booking) {
      // Rollback wallet
      await supabase
        .from("wallets")
        .update({ balance_credits: wallet.balance_credits })
        .eq("id", wallet.id);

      if (bookingErr?.code === "23P01") {
        return NextResponse.json(
          { error: "Slot non disponibile: prenotazione già esistente" },
          { status: 409 }
        );
      }
      console.error("[/api/bookings] Errore booking insert:", bookingErr);
      return NextResponse.json(
        { error: bookingErr?.message ?? "Errore inserimento booking" },
        { status: 500 }
      );
    }

    // ⑩ Registra transazione wallet (best-effort, non bloccante)
    await supabase.from("token_transactions").insert({
      wallet_id: wallet.id,
      type: "DEBIT",
      amount_credits: totalCredits,
      amount_currency: 0,
      stripe_intent_id: null,
      tenant_id: tenantId,
      note: `Prenotazione ${serviceName}`,
    });

    // ⑪ Risposta identica all'RPC originale
    return NextResponse.json(
      [
        {
          booking_id: booking.id,
          total_credits: booking.total_credits,
          status: booking.status,
        },
      ],
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[POST /api/bookings] Errore inatteso:", err);
    return NextResponse.json({ error: err?.message ?? "Errore interno" }, { status: 500 });
  }
}
