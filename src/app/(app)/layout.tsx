import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantFromHost } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const tenant = (await getTenantFromHost()) as any;
    if (tenant) {
      // Inizializzazione automatica per consentire l'accesso immediato e isolato
      const { error } = await (supabase as any).rpc("init_tenant_customer_if_needed", {
        p_tenant_id: tenant.id
      });
      if (error) {
        console.error("[AppLayout] Errore inizializzazione cliente per il tenant:", error);
      }
    }
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <PwaInstallPrompt />
    </>
  );
}

