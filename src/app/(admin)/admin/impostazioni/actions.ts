"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";

export async function updateSystemSettings(formData: FormData) {
  const { supabase } = await requireAdmin();

  const mode = formData.get("mode") as "SELF_ONLY" | "ASSISTED_ONLY" | "HYBRID";
  const max_concurrent = parseInt(formData.get("max_concurrent_assisted") as string, 10);
  
  const enable_assisted = formData.get("enable_assisted_wash") === "on";
  const price_assisted = parseInt(formData.get("price_assisted_wash_credits") as string, 10) || 0;
  
  const enable_full = formData.get("enable_full_grooming") === "on";
  const price_full = parseInt(formData.get("price_full_grooming_credits") as string, 10) || 0;

  if (!mode || isNaN(max_concurrent) || max_concurrent < 0) {
    throw new Error("Dati non validi.");
  }

  const { error } = await (supabase.from("system_settings") as any)
    .update({
      mode,
      max_concurrent_assisted: max_concurrent,
      enable_assisted_wash: enable_assisted,
      price_assisted_wash_credits: price_assisted,
      enable_full_grooming: enable_full,
      price_full_grooming_credits: price_full,
    } as any)
    .eq("id", 1);

  if (error) {
    throw new Error("Errore durante il salvataggio: " + error.message);
  }

  revalidatePath("/admin/impostazioni");
  revalidatePath("/admin/prenotazioni");
}
