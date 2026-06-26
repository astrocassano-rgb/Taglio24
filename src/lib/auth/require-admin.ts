import "server-only";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantFromHost } from "@/lib/tenant";

export async function requireAdmin(options?: { next?: string; mode?: "redirect" | "notFound" }) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    const next = options?.next ?? "/admin";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const tenant = (await getTenantFromHost()) as any;
  const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000000";

  const role = (user as any)?.app_metadata?.role;
  const isSuperAdmin = role === "superadmin";

  let isTenantAdmin = false;
  if (isSuperAdmin) {
    isTenantAdmin = true;
  } else {
    const { data: membership } = await (supabase as any)
      .from("tenant_customers")
      .select("role")
      .eq("customer_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (membership?.role === "admin") {
      isTenantAdmin = true;
    }
  }

  if (!isTenantAdmin) {
    if (options?.mode === "notFound") notFound();
    redirect("/");
  }

  return { supabase, user, tenantId };
}

