import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];

export async function getTenantFromHost(options?: { base?: boolean }): Promise<TenantRow | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  
  // Esempio host: pawspa.taglio24.it, pawspa.localhost:3000, localhost:3000
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
    // Es: pawspa.taglio24.it -> parts: ['pawspa', 'taglio24', 'it']
    if (domainParts.length >= 3) {
      const sub = domainParts[0] || "";
      if (sub !== "www" && sub !== "app") {
        subdomain = sub;
      }
    }
  }

  const supabase = await createSupabaseServerClient({ base: options?.base });

  if (subdomain) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("slug", subdomain)
      .maybeSingle();
    if (tenant) {
      return tenant;
    }
  }

  // Fallback: carichiamo il tenant di default (quello preesistente per i dati storici)
  const { data: defaultTenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", "default")
    .maybeSingle();

  return defaultTenant || null;
}
