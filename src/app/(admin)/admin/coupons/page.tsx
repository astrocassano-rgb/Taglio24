import { requireAdmin } from "@/lib/auth/require-admin";
import { CouponsClient } from "./coupons-client";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const { supabase } = await requireAdmin({ next: "/admin/coupons", mode: "notFound" });

  const { data } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  const coupons = data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Gestione Coupon</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Crea e gestisci i codici promozionali per accreditare token gratuiti nel wallet degli utenti.
        </p>
      </header>

      <CouponsClient initialCoupons={coupons} />
    </div>
  );
}
