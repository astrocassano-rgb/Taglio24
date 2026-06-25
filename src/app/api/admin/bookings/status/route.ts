import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const contentType = request.headers.get("content-type") ?? "";
  const referer = safeRedirectPath(request.headers.get("referer"), "/admin/prenotazioni");

  let bookingId = "";
  let status = "";
  let reason: string | null = null;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    bookingId = body && typeof body === "object" && "booking_id" in body ? String((body as any).booking_id) : "";
    status = body && typeof body === "object" && "status" in body ? String((body as any).status) : "";
    reason = body && typeof body === "object" && "reason" in body ? String((body as any).reason) : null;
  } else {
    const form = await request.formData();
    bookingId = String(form.get("booking_id") ?? "");
    status = String(form.get("status") ?? "");
    const rawReason = form.get("reason");
    reason = rawReason ? String(rawReason) : null;
  }

  if (!bookingId || !status) {
    return Response.json({ error: "Parametri mancanti" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_update_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
    p_reason: reason
  } as any);

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL(referer, request.url), 303);
}

