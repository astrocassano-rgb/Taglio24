"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type StationType = Database["public"]["Enums"]["station_type"];
type BookingServiceType = Database["public"]["Enums"]["booking_service_type"];

export async function createServiceAction(
  name: string,
  description: string,
  stationType: StationType,
  bookingType: BookingServiceType,
  fixedCost: number,
  costPerMinute: number
) {
  try {
    const { supabase, tenantId } = await requireAdmin();

    if (!name.trim() || !stationType || !bookingType) {
      return { error: "Nome, postazione e categoria sono obbligatori." };
    }

    const { error } = await (supabase.from("services") as any).insert({
      tenant_id: tenantId,
      name: name.trim(),
      description: description.trim() || null,
      station_type: stationType,
      booking_type: bookingType,
      fixed_cost_credits: fixedCost,
      cost_per_minute_credits: costPerMinute,
      is_active: true,
    });

    if (error) {
      return { error: "Errore durante la creazione del servizio: " + error.message };
    }

    revalidatePath("/admin/servizi");
    revalidatePath("/prenota");
    return { success: true };
  } catch (err: any) {
    console.error("Errore createServiceAction:", err);
    return { error: err.message || "Errore di connessione." };
  }
}

export async function updateServiceAction(
  id: string,
  name: string,
  description: string,
  stationType: StationType,
  bookingType: BookingServiceType,
  fixedCost: number,
  costPerMinute: number,
  isActive: boolean
) {
  try {
    const { supabase } = await requireAdmin();

    if (!id || !name.trim() || !stationType || !bookingType) {
      return { error: "ID, Nome, postazione e categoria sono obbligatori." };
    }

    const { error } = await (supabase.from("services") as any)
      .update({
        name: name.trim(),
        description: description.trim() || null,
        station_type: stationType,
        booking_type: bookingType,
        fixed_cost_credits: fixedCost,
        cost_per_minute_credits: costPerMinute,
        is_active: isActive,
      })
      .eq("id", id);

    if (error) {
      return { error: "Errore durante l'aggiornamento del servizio: " + error.message };
    }

    revalidatePath("/admin/servizi");
    revalidatePath("/prenota");
    return { success: true };
  } catch (err: any) {
    console.error("Errore updateServiceAction:", err);
    return { error: err.message || "Errore di connessione." };
  }
}

export async function deleteServiceAction(id: string) {
  try {
    const { supabase } = await requireAdmin();

    if (!id) {
      return { error: "ID servizio mancante." };
    }

    const { error } = await (supabase.from("services") as any).delete().eq("id", id);

    if (error) {
      if (error.message.includes("violates foreign key constraint") || error.code === "23503") {
        return { error: "Impossibile eliminare il servizio: ci sono prenotazioni associate." };
      }
      return { error: "Errore durante l'eliminazione del servizio: " + error.message };
    }

    revalidatePath("/admin/servizi");
    revalidatePath("/prenota");
    return { success: true };
  } catch (err: any) {
    console.error("Errore deleteServiceAction:", err);
    return { error: err.message || "Errore di connessione." };
  }
}
