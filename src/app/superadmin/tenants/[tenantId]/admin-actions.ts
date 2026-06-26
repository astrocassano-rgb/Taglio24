"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { requireSuperAdmin } from "@/lib/auth/require-superadmin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function addTenantAdminAction(tenantId: string, email: string) {
  try {
    await requireSuperAdmin();
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: "Non autorizzato" };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!tenantId || !cleanEmail) {
    return { error: "ID salone ed Email sono obbligatori." };
  }

  const adminSupabase = createSupabaseAdminClient();

  try {
    // 1. Cerca se l'utente esiste già in auth
    let existingUser = null;
    let page = 1;
    while (page <= 20) {
      const { data: listData, error: listError } = await adminSupabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) {
        return { error: `Errore durante la ricerca dell'utente: ${listError.message}` };
      }
      const users = listData?.users ?? [];
      const match = users.find(u => (u.email ?? "").toLowerCase() === cleanEmail);
      if (match) {
        existingUser = match;
        break;
      }
      if (users.length < 200) break;
      page++;
    }

    if (existingUser) {
      // 2. L'utente esiste già: lo promuoviamo ad admin di questo salone
      const appMetadata = { ...(existingUser.app_metadata ?? {}), role: "admin", tenant_id: tenantId };
      const userMetadata = { ...(existingUser.user_metadata ?? {}), tenant_id: tenantId };

      const { error: updateAuthErr } = await adminSupabase.auth.admin.updateUserById(existingUser.id, {
        app_metadata: appMetadata,
        user_metadata: userMetadata
      });

      if (updateAuthErr) {
        return { error: `Errore aggiornamento metadati auth: ${updateAuthErr.message}` };
      }

      // 3. Aggiorna il profilo pubblico
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("id")
        .eq("id", existingUser.id)
        .maybeSingle();

      if (!profile) {
        const { error: insertProfileErr } = await adminSupabase
          .from("profiles")
          .insert({ id: existingUser.id, email: cleanEmail });

        if (insertProfileErr) {
          return { error: `Errore creazione profilo: ${insertProfileErr.message}` };
        }
      }

      // 3.1. Associa l'utente come admin per questo specifico salone nella tabella tenant_customers
      const { error: insertMembershipErr } = await adminSupabase
        .from("tenant_customers")
        .upsert({ customer_id: existingUser.id, tenant_id: tenantId, role: "admin" });

      if (insertMembershipErr) {
        return { error: `Errore associazione ruolo admin: ${insertMembershipErr.message}` };
      }

      // 4. Assicura la presenza del portafoglio per questo specifico salone
      const { data: existingWallet } = await adminSupabase
        .from("wallets")
        .select("id")
        .eq("customer_id", existingUser.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!existingWallet) {
        const { error: walletErr } = await adminSupabase
          .from("wallets")
          .insert({ customer_id: existingUser.id, tenant_id: tenantId, balance_credits: 0 });
        if (walletErr) {
          console.error("Errore creazione portafoglio:", walletErr.message);
        }
      }

      revalidatePath(`/superadmin/tenants/${tenantId}`);
      return { success: true, message: `Utente ${cleanEmail} promosso ad Amministratore con successo.` };
    } else {
      // 5. L'utente non esiste: inviamo un invito email
      const { data: inviteData, error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(cleanEmail, {
        data: { tenant_id: tenantId }
      });

      if (inviteErr) {
        return { error: `Errore durante l'invio dell'invito: ${inviteErr.message}` };
      }

      const invitedId = inviteData?.user?.id;
      if (!invitedId) {
        return { error: "Invito inviato ma nessun ID utente generato." };
      }

      // Impostiamo il ruolo di admin fin da subito nei metadati
      const { error: updateAuthErr } = await adminSupabase.auth.admin.updateUserById(invitedId, {
        app_metadata: { role: "admin", tenant_id: tenantId },
        user_metadata: { tenant_id: tenantId }
      });

      if (updateAuthErr) {
        return { error: `Errore impostazione ruolo utente invitato: ${updateAuthErr.message}` };
      }

      revalidatePath(`/superadmin/tenants/${tenantId}`);
      return { success: true, message: `Invito inviato con successo a ${cleanEmail}. Diventerà amministratore appena accetterà l'invito.` };
    }
  } catch (err: any) {
    console.error("Errore addTenantAdminAction:", err);
    return { error: err?.message || "Si è verificato un errore imprevisto." };
  }
}

export async function removeTenantAdminAction(tenantId: string, userId: string) {
  try {
    await requireSuperAdmin();
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: "Non autorizzato" };
  }

  if (!tenantId || !userId) {
    return { error: "ID salone ed ID utente sono obbligatori." };
  }

  const adminSupabase = createSupabaseAdminClient();

  try {
    // 1. Recupera l'utente
    const { data: userData, error: getUserErr } = await adminSupabase.auth.admin.getUserById(userId);
    if (getUserErr || !userData?.user) {
      return { error: `Utente non trovato: ${getUserErr?.message || 'ID non valido'}` };
    }
    const user = userData.user;

    // 2. Modifica i metadati
    const appMetadata = { ...(user.app_metadata ?? {}) };
    delete appMetadata.role; // Rimuove il ruolo di admin
    appMetadata.tenant_id = "00000000-0000-0000-0000-000000000000"; // default tenant

    const userMetadata = { ...(user.user_metadata ?? {}) };
    userMetadata.tenant_id = "00000000-0000-0000-0000-000000000000";

    const { error: updateAuthErr } = await adminSupabase.auth.admin.updateUserById(userId, {
      app_metadata: appMetadata,
      user_metadata: userMetadata
    });

    if (updateAuthErr) {
      return { error: `Errore aggiornamento metadati auth: ${updateAuthErr.message}` };
    }

    // 3. Rimuove il ruolo admin per questo salone nella tabella tenant_customers
    const { error: deleteMembershipErr } = await adminSupabase
      .from("tenant_customers")
      .delete()
      .eq("customer_id", userId)
      .eq("tenant_id", tenantId);

    if (deleteMembershipErr) {
      return { error: `Errore rimozione ruolo admin: ${deleteMembershipErr.message}` };
    }

    revalidatePath(`/superadmin/tenants/${tenantId}`);
    return { success: true, message: "Privilegi di amministratore rimossi con successo." };
  } catch (err: any) {
    console.error("Errore removeTenantAdminAction:", err);
    return { error: err?.message || "Si è verificato un errore imprevisto." };
  }
}
