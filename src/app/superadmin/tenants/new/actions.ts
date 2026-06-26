"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addTenantDomain } from "@/lib/vercel";

export async function createTenantAction(prevState: any, formData: FormData) {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Non autorizzato" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "LIGHT");
  const endsAtRaw = String(formData.get("subscription_ends_at") ?? "").trim();

  // Validazione
  if (!name || !slug) {
    return { error: "Nome e Slug sono obbligatori." };
  }
  
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Lo slug può contenere solo lettere minuscole, numeri e trattini (es. paw-spa)." };
  }

  // Rifiuto degli slug riservati
  const reservedSlugs = ["app", "www", "api", "admin", "superadmin"];
  if (reservedSlugs.includes(slug)) {
    return { error: "Questo slug è riservato (es. app, www, api, admin)." };
  }

  const subscription_ends_at = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;
  const adminSupabase = createSupabaseAdminClient();

  // 1. Inserimento del tenant
  const { data: tenant, error: tenantErr } = await (adminSupabase.from("tenants") as any)
    .insert({
      name,
      slug,
      plan,
      subscription_ends_at,
    })
    .select("id")
    .single();

  if (tenantErr) {
    console.error("Errore inserimento tenant:", tenantErr);
    if (tenantErr.message?.includes("unique")) {
      return { error: "Uno salone con questo slug esiste già." };
    }
    return { error: `Errore database: ${tenantErr.message}` };
  }

  const tenantId = tenant.id;

  // 1.5 Aggiunta del dominio su Vercel (non bloccante per l'utente)
  try {
    await addTenantDomain(slug);
    console.log(`[Vercel Domain Config] Dominio aggiunto con successo su Vercel per lo slug: ${slug}`);
  } catch (error) {
    console.error(`[Vercel Domain Config] Errore durante l'aggiunta del dominio su Vercel per lo slug ${slug}:`, error);
  }

  // 2. Creazione automatica dei system_settings di default per il nuovo salone
  const { error: settingsErr } = await (adminSupabase.from("system_settings") as any)
    .insert({
      tenant_id: tenantId,
      mode: "HYBRID",
      max_concurrent_assisted: 1,
      enable_assisted_wash: true,
      price_assisted_wash_credits: 10,
      enable_full_grooming: true,
      price_full_grooming_credits: 50,
    });

  if (settingsErr) {
    console.error("Errore creazione system_settings per nuovo tenant:", settingsErr);
    // Non blocchiamo ma lo logghiamo
  }

  redirect("/superadmin/tenants" as Route);
}
