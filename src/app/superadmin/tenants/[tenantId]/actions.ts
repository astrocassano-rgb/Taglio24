"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addTenantDomain, removeTenantDomain } from "@/lib/vercel";

const VALID_PLANS = ["LIGHT", "PRO", "ENTERPRISE"] as const;
type Plan = (typeof VALID_PLANS)[number];

/** Guard comune: autorizza il superadmin e restituisce un eventuale errore già pronto. */
async function ensureSuperAdmin(): Promise<{ error: string } | null> {
  try {
    await requireSuperAdmin();
    return null;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: "Non autorizzato" };
  }
}

/**
 * Proroga l'abbonamento di N mesi (azione operativa rapida, claude.ai).
 * Base di calcolo: la scadenza attuale se è nel futuro, altrimenti "ora" (così prorogare un
 * salone già scaduto riparte da oggi, non dalla vecchia data passata).
 */
export async function extendSubscriptionAction(tenantId: string, months: number) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !Number.isFinite(months) || months <= 0) {
    return { error: "Parametri di proroga non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: tenant } = await adminSupabase.from("tenants").select("subscription_ends_at").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "Salone non trovato." };

  const current = tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at) : null;
  const base = current && current.getTime() > Date.now() ? current : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + Math.floor(months));

  const { error } = await (adminSupabase.from("tenants") as any)
    .update({ subscription_ends_at: next.toISOString() })
    .eq("id", tenantId);
  if (error) return { error: `Errore database: ${error.message}` };

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  revalidatePath("/superadmin" as Route);
  return { success: true, message: `Abbonamento prorogato di ${months} mes${months === 1 ? "e" : "i"} (scadenza: ${next.toLocaleDateString("it-IT")}).` };
}

/**
 * Sospende il salone impostando la scadenza a "ora" (entra subito in stato Scaduto e
 * il middleware reindirizza i clienti a /abbonamento-scaduto). Non c'è una colonna "status"
 * dedicata: usiamo subscription_ends_at per evitare migrazioni.
 */
export async function suspendTenantAction(tenantId: string) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;
  if (!tenantId) return { error: "ID salone mancante." };

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("tenants") as any)
    .update({ subscription_ends_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) return { error: `Errore database: ${error.message}` };

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  revalidatePath("/superadmin" as Route);
  return { success: true, message: "Salone sospeso: l'abbonamento risulta scaduto da ora." };
}

/**
 * Riattiva un salone sospeso/scaduto prorogando di `months` mesi a partire da oggi
 * (default 12). Per un abbonamento "senza scadenza" passare months <= 0 → azzera la scadenza.
 */
export async function reactivateTenantAction(tenantId: string, months = 12) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;
  if (!tenantId) return { error: "ID salone mancante." };

  const adminSupabase = createSupabaseAdminClient();

  let newEndsAt: string | null;
  let label: string;
  if (months <= 0) {
    newEndsAt = null; // nessuna scadenza
    label = "senza scadenza";
  } else {
    const next = new Date();
    next.setMonth(next.getMonth() + Math.floor(months));
    newEndsAt = next.toISOString();
    label = `scadenza ${next.toLocaleDateString("it-IT")}`;
  }

  const { error } = await (adminSupabase.from("tenants") as any)
    .update({ subscription_ends_at: newEndsAt })
    .eq("id", tenantId);
  if (error) return { error: `Errore database: ${error.message}` };

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  revalidatePath("/superadmin" as Route);
  return { success: true, message: `Salone riattivato (${label}).` };
}

/** Cambia il piano commerciale del salone (LIGHT / PRO / ENTERPRISE). */
export async function changePlanAction(tenantId: string, plan: string) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;
  if (!tenantId) return { error: "ID salone mancante." };
  if (!VALID_PLANS.includes(plan as Plan)) {
    return { error: "Piano non valido." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("tenants") as any).update({ plan }).eq("id", tenantId);
  if (error) return { error: `Errore database: ${error.message}` };

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  revalidatePath("/superadmin" as Route);
  return { success: true, message: `Piano aggiornato a ${plan}.` };
}

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

export async function createTenantStationAction(
  tenantId: string,
  name: string,
  type: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE",
  costPerMinute: number
) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !name.trim() || !type || costPerMinute <= 0) {
    return { error: "Parametri non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();

  let layout_zone = "Area Servizio";
  if (type === "WASH_BASIN") layout_zone = "Area Lavaggio";
  else if (type === "DRYING_ZONE") layout_zone = "Area Asciugatura";
  else if (type === "GROOMING_TABLE") layout_zone = "Area Toelettatura";

  const { error } = await (adminSupabase.from("stations") as any).insert({
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

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  return { success: true };
}

export async function deleteTenantStationAction(tenantId: string, stationId: string) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !stationId) {
    return { error: "Parametri non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("stations") as any)
    .delete()
    .eq("id", stationId)
    .eq("tenant_id", tenantId);

  if (error) {
    if (error.message.includes("violates foreign key constraint") || error.code === "23503") {
      return { error: "Impossibile eliminare la postazione: ci sono prenotazioni associate ad essa." };
    }
    return { error: "Errore durante l'eliminazione: " + error.message };
  }

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  return { success: true };
}

export async function createTenantServiceAction(
  tenantId: string,
  name: string,
  description: string,
  stationType: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE",
  bookingType: "SELF_SERVICE" | "ASSISTED_WASH" | "FULL_GROOMING",
  fixedCost: number,
  costPerMinute: number
) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !name.trim() || !stationType || !bookingType) {
    return { error: "Parametri non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("services") as any).insert({
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

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  return { success: true };
}

export async function updateTenantServiceAction(
  tenantId: string,
  id: string,
  name: string,
  description: string,
  stationType: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE",
  bookingType: "SELF_SERVICE" | "ASSISTED_WASH" | "FULL_GROOMING",
  fixedCost: number,
  costPerMinute: number,
  isActive: boolean
) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !id || !name.trim() || !stationType || !bookingType) {
    return { error: "Parametri non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("services") as any)
    .update({
      name: name.trim(),
      description: description.trim() || null,
      station_type: stationType,
      booking_type: bookingType,
      fixed_cost_credits: fixedCost,
      cost_per_minute_credits: costPerMinute,
      is_active: isActive,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return { error: "Errore durante l'aggiornamento del servizio: " + error.message };
  }

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  return { success: true };
}

export async function deleteTenantServiceAction(tenantId: string, id: string) {
  const unauthorized = await ensureSuperAdmin();
  if (unauthorized) return unauthorized;

  if (!tenantId || !id) {
    return { error: "Parametri non validi." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await (adminSupabase.from("services") as any)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (error.message.includes("violates foreign key constraint") || error.code === "23503") {
      return { error: "Impossibile eliminare il servizio: ci sono prenotazioni associate." };
    }
    return { error: "Errore durante l'eliminazione del servizio: " + error.message };
  }

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  return { success: true };
}


