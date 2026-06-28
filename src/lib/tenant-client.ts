import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function getSubdomainFromWindow(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.host;
  
  // Localhost
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    const parts = host.split(":");
    const localParts = parts[0]?.split(".") ?? [];
    if (localParts.length > 1) {
      return localParts[0] || "";
    }
  } else {
    // Es: pawspa.taglio24.it -> parts: ['pawspa', 'taglio24', 'it']
    const domainParts = host.split(".");
    if (domainParts.length >= 3) {
      const sub = domainParts[0] || "";
      if (sub !== "www" && sub !== "app") {
        return sub;
      }
    }
  }
  return "";
}

export async function getTenantIdFromClient(): Promise<string> {
  const subdomain = getSubdomainFromWindow();
  const defaultTenantId = "00000000-0000-0000-0000-000000000000";
  
  if (!subdomain) {
    return defaultTenantId;
  }

  try {
    const supabase = createSupabaseBrowserClient();
    const { data: tenant } = await (supabase.from("tenants") as any)
      .select("id")
      .eq("slug", subdomain)
      .maybeSingle();

    return (tenant as any)?.id ?? defaultTenantId;
  } catch (error) {
    console.error("Errore nel recupero del tenant_id client:", error);
    return defaultTenantId;
  }
}
