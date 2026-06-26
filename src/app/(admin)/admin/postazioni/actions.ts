"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type StationType = Database["public"]["Enums"]["station_type"];

export async function createStationAction(
  name: string,
  type: StationType,
  costPerMinute: number
) {
  try {
    const { supabase, tenantId } = await requireAdmin();

    if (!name.trim() || !type || costPerMinute <= 0) {
      return { error: "Parametri non validi." };
    }

    // Determina la zona iniziale in base al tipo di postazione
    let layout_zone = "Area Servizio";
    if (type === "WASH_BASIN") layout_zone = "Area Lavaggio";
    else if (type === "DRYING_ZONE") layout_zone = "Area Asciugatura";
    else if (type === "GROOMING_TABLE") layout_zone = "Area Toelettatura";

    const { error } = await (supabase.from("stations") as any).insert({
      name: name.trim(),
      type,
      cost_per_minute: costPerMinute,
      tenant_id: tenantId,
      status: "AVAILABLE",
      layout_x: 10,
      layout_y: 10,
      layout_w: 16,
      layout_h: 12,
      layout_zone,
    });

    if (error) {
      return { error: "Errore durante la creazione: " + error.message };
    }

    revalidatePath("/admin/postazioni");
    return { success: true };
  } catch (err: any) {
    console.error("Errore createStationAction:", err);
    return { error: err.message || "Errore di connessione." };
  }
}

export async function deleteStationAction(stationId: string) {
  try {
    const { supabase } = await requireAdmin();

    if (!stationId) {
      return { error: "ID postazione mancante." };
    }

    const { error } = await (supabase.from("stations") as any).delete().eq("id", stationId);

    if (error) {
      // Codice postgres 23503 indica una violazione di chiave esterna (foreign key violation)
      if (error.message.includes("violates foreign key constraint") || error.code === "23503") {
        return { error: "Impossibile eliminare la postazione: ci sono prenotazioni associate ad essa." };
      }
      return { error: "Errore durante l'eliminazione: " + error.message };
    }

    revalidatePath("/admin/postazioni");
    return { success: true };
  } catch (err: any) {
    console.error("Errore deleteStationAction:", err);
    return { error: err.message || "Errore di connessione." };
  }
}
