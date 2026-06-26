import { requireAdmin } from "@/lib/auth/require-admin";
import { ServicesManager } from "./services-manager";

export const dynamic = "force-dynamic";

export default async function AdminServiziPage() {
  const { supabase, tenantId } = await requireAdmin({ next: "/admin/servizi", mode: "notFound" });

  const { data: servicesData } = await (supabase.from("services") as any)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const services = (servicesData ?? []) as any[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Listino Servizi</h2>
        <p className="text-sm leading-relaxed text-slate-300">
          Gestisci il catalogo dei servizi offerti, le tariffe e le categorie logiche per le prenotazioni del salone.
        </p>
      </header>

      <ServicesManager initialServices={services} />
    </div>
  );
}
