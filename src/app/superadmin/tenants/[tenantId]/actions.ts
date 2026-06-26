"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addTenantDomain, removeTenantDomain } from "@/lib/vercel";

export async function updateTenantAction(prevState: any, formData: FormData) {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Non autorizzato" };
  }

  const tenantId = String(formData.get("tenant_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "LIGHT");
  const endsAtRaw = String(formData.get("subscription_ends_at") ?? "").trim();

  if (!tenantId || !name || !slug) {
    return { error: "ID, Nome e Slug sono obbligatori." };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Lo slug può contenere solo lettere minuscole, numeri e trattini (es. paw-spa)." };
  }

  const subscription_ends_at = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;
  const adminSupabase = createSupabaseAdminClient();

  // Recupera lo slug prima dell'aggiornamento
  const { data: oldTenant } = await adminSupabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const oldSlug = oldTenant?.slug;

  const { error } = await (adminSupabase.from("tenants") as any)
    .update({
      name,
      slug,
      plan,
      subscription_ends_at,
    })
    .eq("id", tenantId);

  if (error) {
    console.error("Errore aggiornamento tenant:", error);
    if (error.message?.includes("unique")) {
      return { error: "Un salone con questo slug esiste già." };
    }
    return { error: `Errore database: ${error.message}` };
  }

  // Gestione domini su Vercel se lo slug è cambiato
  if (oldSlug && oldSlug !== slug && slug !== "default") {
    try {
      await addTenantDomain(slug);
      console.log(`[Vercel Domain Config] Nuovo dominio aggiunto per lo slug: ${slug}`);

      if (oldSlug !== "default") {
        await removeTenantDomain(oldSlug);
        console.log(`[Vercel Domain Config] Vecchio dominio rimosso per lo slug: ${oldSlug}`);
      }
    } catch (vercelError) {
      console.error("[Vercel Domain Config] Errore aggiornamento domini su Vercel:", vercelError);
    }
  }

  redirect("/superadmin/tenants" as Route);
}

export async function deleteTenantAction(prevState: any, formData: FormData) {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Non autorizzato" };
  }

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) {
    return { error: "ID salone mancante." };
  }

  const adminSupabase = createSupabaseAdminClient();

  // Recupera lo slug prima dell'eliminazione dal database
  const { data: tenantData } = await adminSupabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenantData?.slug;

  // RLS e CASCADE cancelleranno tutti i dati del tenant
  const { error } = await adminSupabase
    .from("tenants")
    .delete()
    .eq("id", tenantId);

  if (error) {
    console.error("Errore eliminazione tenant:", error);
    return { error: `Errore database: ${error.message}` };
  }

  // Rimuovi il dominio da Vercel se lo slug è valido
  if (slug && slug !== "default") {
    try {
      await removeTenantDomain(slug);
      console.log(`[Vercel Domain Config] Dominio rimosso da Vercel per lo slug: ${slug}`);
    } catch (vercelError) {
      console.error(`[Vercel Domain Config] Errore rimozione dominio da Vercel per lo slug ${slug}:`, vercelError);
    }
  }

  redirect("/superadmin/tenants" as Route);
}
