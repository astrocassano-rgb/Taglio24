import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getEnv();
  if (!env) throw new Error("Variabili d'ambiente Supabase mancanti (.env.local).");
  
  let tenantId = "";
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )current_tenant_id=([^;]*)/);
    if (match) {
      tenantId = decodeURIComponent(match[1] || "");
    }
  }

  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        ...(tenantId ? { "x-tenant-id": tenantId } : {})
      }
    }
  });
}
