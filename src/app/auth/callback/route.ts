import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Accetta solo path relativi — previene open redirect verso domini esterni */
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  // Blocca anche protocolli mascherati tipo /\evil.com
  try {
    const url = new URL(value, "http://localhost");
    if (url.hostname !== "localhost") return "/";
  } catch {
    return "/";
  }
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("Errore durante exchangeCodeForSession:", error.message);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
        );
      }

      // --- ASSOCIAZIONE TENANT A NUOVO UTENTE GOOGLE OAUTH ---
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const host = request.headers.get("host") || "";
        const domainParts = host.split(".");
        let subdomain = "";

        if (host.includes("localhost") || host.includes("127.0.0.1")) {
          const parts = host.split(":");
          const part0 = parts[0];
          if (part0) {
            const localParts = part0.split(".");
            if (localParts.length > 1) {
              subdomain = localParts[0] || "";
            }
          }
        } else {
          if (domainParts.length >= 3) {
            const sub = domainParts[0] || "";
            if (sub !== "www" && sub !== "app") {
              subdomain = sub;
            }
          }
        }

        if (subdomain && subdomain !== "default") {
          // Controlliamo se è un nuovo utente (creato negli ultimi 30 secondi)
          const isNewUser = user.created_at && (new Date().getTime() - new Date(user.created_at).getTime() < 30000);
          
          if (isNewUser) {
            const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
            const adminSupabase = createSupabaseAdminClient();
            
            const { data: tenant } = await (adminSupabase.from("tenants") as any)
              .select("id")
              .eq("slug", subdomain)
              .maybeSingle();

            if (tenant) {
              // 1. Provisioning del salone + bonus di benvenuto tramite la funzione SQL CONDIVISA
              //    provision_tenant_welcome (la stessa usata dal trigger handle_new_user sul signup
              //    email). Vantaggi rispetto al vecchio doppio upsert manuale:
              //      - bonus identico tra email e OAuth (coerenza);
              //      - idempotente: il bonus scatta UNA sola volta per (utente, salone) → no farming;
              //      - scrive nel ledger token_transactions (tracciabilità del bonus);
              //      - niente più upsert su wallets che AZZERAVA/sovrascriveva il saldo a 2 in caso
              //        di portafoglio già esistente (bug del codice precedente).
              //    La funzione è eseguibile solo via service-role (qui adminSupabase): vedi GRANT in migrazione.
              const { error: provisionErr } = await (adminSupabase as any).rpc("provision_tenant_welcome", {
                p_user_id: user.id,
                p_tenant_id: tenant.id,
              });
              if (provisionErr) {
                console.error("[OAuth Callback] Errore provisioning tenant/bonus benvenuto:", provisionErr);
              }

              // 2. Aggiorna i metadati Auth dell'utente. NB: tenant_id in user_metadata NON è più usato
              //    per risolvere il tenant (vedi current_tenant_id), ma serve ancora alla pagina
              //    superadmin /superadmin/tenants/[tenantId] per filtrare gli utenti del salone.
              await adminSupabase.auth.admin.updateUserById(user.id, {
                user_metadata: { ...(user.user_metadata ?? {}), tenant_id: tenant.id }
              });
              
              console.log(`[OAuth Callback] Assegnato tenant ${subdomain} a nuovo utente ${user.email}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Errore imprevisto nel callback auth:", err?.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(err?.message ?? "Errore di autenticazione")}`, request.url)
      );
    }
  }

  // URL di reindirizzamento sicuro (validato da safeNextPath)
  return NextResponse.redirect(new URL(next, request.url));
}
