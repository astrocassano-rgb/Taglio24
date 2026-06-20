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

  const contentType = request.headers.get("content-type") ?? "";
  const referer = safeRedirectPath(request.headers.get("referer"), "/admin/sessioni");
  let sessionId = "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    sessionId = body && typeof body === "object" && "session_id" in body ? String((body as any).session_id) : "";
  } else {
    const form = await request.formData();
    sessionId = String(form.get("session_id") ?? "");
  }

  if (!sessionId) {
    return Response.json({ error: "Sessione mancante" }, { status: 400 });
  }

  const { error } = await supabase.from("active_sessions").delete().eq("id", sessionId);
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  // Audit log
  await logAdminAction(user.id, "SESSION_STOP", "session", sessionId, { forced: true });

  return NextResponse.redirect(new URL(referer, request.url), 303);
}
