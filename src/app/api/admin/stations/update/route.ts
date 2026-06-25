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
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const stationId = String(form.get("station_id") ?? "");
  const status = String(form.get("status") ?? "");
  const name = String(form.get("name") ?? "");
  const costRaw = String(form.get("cost_per_minute") ?? "");
  const zone = String(form.get("layout_zone") ?? "").trim();
  const xRaw = String(form.get("layout_x") ?? "");
  const yRaw = String(form.get("layout_y") ?? "");
  const wRaw = String(form.get("layout_w") ?? "");
  const hRaw = String(form.get("layout_h") ?? "");
  const referer = safeRedirectPath(request.headers.get("referer"), "/admin/postazioni");

  const cost = Number(costRaw.replace(",", "."));
  const layoutX = Number(xRaw);
  const layoutY = Number(yRaw);
  const layoutW = Number(wRaw);
  const layoutH = Number(hRaw);

  if (
    !stationId ||
    !name ||
    !zone ||
    !Number.isFinite(cost) ||
    cost <= 0 ||
    !Number.isInteger(layoutX) ||
    !Number.isInteger(layoutY) ||
    !Number.isInteger(layoutW) ||
    !Number.isInteger(layoutH) ||
    layoutX < 0 ||
    layoutX > 95 ||
    layoutY < 0 ||
    layoutY > 95 ||
    layoutW < 8 ||
    layoutW > 100 ||
    layoutH < 8 ||
    layoutH > 100
  ) {
    return Response.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from("stations")
    .update({
      name,
      status,
      cost_per_minute: cost,
      layout_zone: zone,
      layout_x: layoutX,
      layout_y: layoutY,
      layout_w: layoutW,
      layout_h: layoutH
    })
    .eq("id", stationId);
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  // Audit log
  await logAdminAction(user.id, "STATION_MAINTENANCE", "station", stationId, { status, name });

  if (wantsJson) {
    return Response.json({ ok: true });
  }

  return NextResponse.redirect(new URL(referer, request.url), 303);
}
