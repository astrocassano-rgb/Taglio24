import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/admin/audit";
import { safeRedirectPath } from "@/lib/safe-redirect";

function isAdminUser(user: any) {
  return Boolean(user && user.app_metadata && user.app_metadata.role === "admin");
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user as any;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }
  if (!isAdminUser(user)) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const form = await request.formData();
  const customerId = String(form.get("customer_id") ?? "");
  const amountRaw = String(form.get("amount_credits") ?? "");
  const reason = String(form.get("reason") ?? "").trim() || null;
  const referer = safeRedirectPath(request.headers.get("referer"), "/admin/clienti");

  const amount = Number(amountRaw.replace(",", "."));
  if (!customerId || !Number.isFinite(amount) || amount === 0) {
    return Response.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_adjust_wallet", {
    p_customer_id: customerId,
    p_amount_credits: amount,
    p_reason: reason
  } as any);

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  // Audit log
  await logAdminAction(user.id, "MANUAL_TOPUP", "wallet", customerId, { amount, reason });

  return NextResponse.redirect(new URL(referer, request.url), 303);
}

