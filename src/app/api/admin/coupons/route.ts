import { createSupabaseServerClient } from "@/lib/supabase/server";

async function isUserAdmin() {
  const supabase = (await createSupabaseServerClient()) as any;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return Boolean(isAdmin);
}

export async function GET() {
  if (!(await isUserAdmin())) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const supabase = (await createSupabaseServerClient()) as any;
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ coupons: data });
}

export async function POST(request: Request) {
  if (!(await isUserAdmin())) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const supabase = (await createSupabaseServerClient()) as any;
  let code = "";
  let amountCredits = 0;
  let maxUses: number | null = null;
  let expiresAt: string | null = null;

  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    amountCredits = typeof body?.amount_credits === "number" ? body.amount_credits : 0;
    maxUses = typeof body?.max_uses === "number" ? body.max_uses : null;
    expiresAt = typeof body?.expires_at === "string" && body.expires_at ? body.expires_at : null;
  } catch {
    return Response.json({ error: "Formato richiesta non valido" }, { status: 400 });
  }

  if (!code || amountCredits <= 0) {
    return Response.json({ error: "Codice e crediti sono obbligatori e validi." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      code,
      amount_credits: amountCredits,
      max_uses: maxUses,
      expires_at: expiresAt
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ ok: true, coupon: data });
}

export async function DELETE(request: Request) {
  if (!(await isUserAdmin())) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const supabase = (await createSupabaseServerClient()) as any;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "ID coupon mancante" }, { status: 400 });
  }

  const { error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ ok: true });
}
