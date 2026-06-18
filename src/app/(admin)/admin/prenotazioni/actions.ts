"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

export async function createAdminBooking(formData: FormData) {
  const { supabase } = await requireAdmin();

  const customerId = formData.get("customer_id") as string;
  const dogId = formData.get("dog_id") as string;
  const stationId = formData.get("station_id") as string;
  const serviceType = formData.get("service_type") as Database["public"]["Enums"]["booking_service_type"];
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (!customerId || !dogId || !stationId || !serviceType || !startTime || !endTime) {
    throw new Error("Tutti i campi sono obbligatori.");
  }

  const { error } = await (supabase.from("bookings") as any).insert({
    customer_id: customerId,
    dog_id: dogId,
    station_id: stationId,
    service_type: serviceType,
    start_time: startTime,
    end_time: endTime,
    status: "CONFIRMED",
    total_credits: 0,
    operator_cost_credits: 0,
  } as any);

  if (error) {
    throw new Error("Errore durante la creazione: " + error.message);
  }

  revalidatePath("/admin/prenotazioni");
}
